import pool from '../config/database.js';
import { STAFF_ROLE_SET } from '../constants/schemaEnums.js';
import { emitChatAssigned, emitChatMessage, emitChatSeen } from '../socket.js';
import { isDatabaseConnectivityError, supabaseRestFetch, supabaseRestRequest } from '../services/supabaseRest.js';
import { sanitizePlainText, sanitizeUrlArray } from '../utils/inputSanitizer.js';

const STAFF_ROLES = STAFF_ROLE_SET;
const MESSAGE_TYPES = new Set(['text', 'image', 'video', 'system']);
const memoryChatStore = {
  nextThreadId: -1,
  nextMessageId: -1,
  threads: [],
  messages: [],
  participants: [],
};

const isStaffUser = (user) => STAFF_ROLES.has(String(user?.role || '').toLowerCase());

const ensureChatSchema = async () => {
  // Schema is managed exclusively by Knex migrations.
  return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_threads (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      assigned_staff_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      subject VARCHAR(255),
      status VARCHAR(20) NOT NULL DEFAULT 'open',
      last_message_at TIMESTAMP,
      blocked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      block_reason TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS chat_participants (
      id SERIAL PRIMARY KEY,
      thread_id INTEGER NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(50) NOT NULL,
      unread_count INTEGER NOT NULL DEFAULT 0,
      last_read_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(thread_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id SERIAL PRIMARY KEY,
      thread_id INTEGER NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
      sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      body TEXT,
      media_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
      message_type VARCHAR(20) NOT NULL DEFAULT 'text',
      order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
      seen_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS chat_quick_replies (
      id SERIAL PRIMARY KEY,
      title VARCHAR(120) NOT NULL,
      body TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `).catch((error) => {
    console.error('Failed to ensure chat schema:', error);
  });
};
const chatSchemaReady = ensureChatSchema();

const getThreadById = async (db, threadId) => {
  const result = await db.query(
    `SELECT ct.*, u.name as customer_name, u.email as customer_email,
            staff.name as assigned_staff_name,
            o.status as order_status, o.payment_method, o.shipping_method, o.waybill_status,
            p.name as product_name
     FROM chat_threads ct
     LEFT JOIN users u ON u.id = ct.customer_id
     LEFT JOIN users staff ON staff.id = ct.assigned_staff_id
     LEFT JOIN orders o ON o.id = ct.order_id
     LEFT JOIN products p ON p.id = ct.product_id
     WHERE ct.id = $1`,
    [threadId]
  );
  return result.rows[0] || null;
};

const assertThreadAccess = (thread, user) => {
  if (!thread || !user) return false;
  if (isStaffUser(user)) return true;
  return Number(thread.customer_id) === Number(user.id);
};

const ensureParticipant = async (db, threadId, user) => {
  if (!user?.id) return;
  await db.query(
    `INSERT INTO chat_participants (thread_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (thread_id, user_id) DO NOTHING`,
    [threadId, user.id, user.role || 'customer']
  );
};

const nowIso = () => new Date().toISOString();

const mapRestThread = (thread = {}) => ({
  ...thread,
  unread_count: Number(thread.unread_count || 0),
  customer_name: thread.customer_name || thread.customer?.name || null,
  customer_email: thread.customer_email || thread.customer?.email || null,
  assigned_staff_name: thread.assigned_staff_name || thread.assigned_staff?.name || null,
  product_name: thread.product_name || thread.product?.name || null,
  order_status: thread.order_status || thread.order?.status || null,
});

const fetchRestThreadById = async (threadId) => {
  const rows = await supabaseRestFetch('chat_threads', {
    select: '*',
    id: `eq.${Number(threadId)}`,
    limit: 1,
  });
  return rows?.[0] ? mapRestThread(rows[0]) : null;
};

const ensureRestParticipant = async (threadId, user) => {
  if (!user?.id) return;
  try {
    await supabaseRestRequest('chat_participants', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        thread_id: Number(threadId),
        user_id: Number(user.id),
        role: user.role || 'customer',
      },
    });
  } catch (error) {
    if (error?.status !== 409) throw error;
  }
};

const getThreadsViaRest = async (req, res) => {
  const queryParams = {
    select: '*',
    order: 'last_message_at.desc.nullslast,updated_at.desc,created_at.desc',
  };
  if (!isStaffUser(req.user)) {
    queryParams.customer_id = `eq.${Number(req.user.id)}`;
  }

  const rows = await supabaseRestFetch('chat_threads', queryParams);
  res.json((rows || []).map(mapRestThread));
};

const getThreadViaRest = async (req, res) => {
  const thread = await fetchRestThreadById(req.params.id);
  if (!thread) return res.status(404).json({ message: 'Chat not found' });
  if (!assertThreadAccess(thread, req.user)) return res.status(403).json({ message: 'Access denied' });

  const messages = await supabaseRestFetch('chat_messages', {
    select: '*',
    thread_id: `eq.${Number(thread.id)}`,
    order: 'created_at.asc,id.asc',
  });

  res.json({ thread, messages: messages || [] });
};

const createThreadViaRest = async (req, res) => {
  const { order_id, product_id } = req.body || {};
  const productId = Number(product_id);
  const orderId = Number(order_id);
  const subject = sanitizePlainText(req.body?.subject, { maxLength: 255 });
  const initialMessage = sanitizePlainText(req.body?.message, { maxLength: 5000 });

  if (!isStaffUser(req.user) && (!Number.isInteger(productId) || productId <= 0)) {
    return res.status(400).json({ message: 'Product chat requires a valid product.' });
  }

  const existingQuery = {
    select: '*',
    customer_id: `eq.${Number(req.user.id)}`,
    status: 'neq.blocked',
    order: 'updated_at.desc',
    limit: 1,
  };
  if (Number.isInteger(productId) && productId > 0) {
    existingQuery.product_id = `eq.${productId}`;
  } else if (Number.isInteger(orderId) && orderId > 0) {
    existingQuery.order_id = `eq.${orderId}`;
  } else {
    existingQuery.product_id = 'is.null';
    existingQuery.order_id = 'is.null';
  }

  const existing = await supabaseRestFetch('chat_threads', existingQuery);
  let thread = existing?.[0] ? mapRestThread(existing[0]) : null;

  if (!thread) {
    const inserted = await supabaseRestRequest('chat_threads', {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        customer_id: Number(req.user.id),
        order_id: Number.isInteger(orderId) && orderId > 0 ? orderId : null,
        product_id: Number.isInteger(productId) && productId > 0 ? productId : null,
        subject: subject || null,
        status: 'open',
      },
    });
    thread = mapRestThread(inserted?.[0] || {});
    await ensureRestParticipant(thread.id, req.user);
  }

  let message = null;
  if (initialMessage) {
    const insertedMessage = await supabaseRestRequest('chat_messages', {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        thread_id: Number(thread.id),
        sender_id: Number(req.user.id),
        body: initialMessage,
        media_urls: [],
        message_type: 'text',
        order_id: Number.isInteger(orderId) && orderId > 0 ? orderId : null,
      },
    });
    message = insertedMessage?.[0] || null;
    await supabaseRestRequest('chat_threads', {
      method: 'PATCH',
      queryParams: { id: `eq.${Number(thread.id)}` },
      prefer: 'return=representation',
      body: { last_message_at: nowIso(), updated_at: nowIso() },
    });
  }

  const freshThread = await fetchRestThreadById(thread.id) || thread;
  if (message) emitChatMessage(freshThread, message);
  res.status(201).json({ thread: freshThread, message });
};

const createMemoryThread = (req) => {
  const { order_id, product_id } = req.body || {};
  const productId = Number(product_id);
  const orderId = Number(order_id);
  const subject = sanitizePlainText(req.body?.subject, { maxLength: 255 });
  const initialMessage = sanitizePlainText(req.body?.message, { maxLength: 5000 });

  if (!isStaffUser(req.user) && (!Number.isInteger(productId) || productId <= 0)) {
    return { status: 400, body: { message: 'Product chat requires a valid product.' } };
  }

  let thread = memoryChatStore.threads.find((item) => {
    if (Number(item.customer_id) !== Number(req.user.id) || item.status === 'blocked') return false;
    if (Number.isInteger(productId) && productId > 0) return Number(item.product_id) === productId;
    if (Number.isInteger(orderId) && orderId > 0) return Number(item.order_id) === orderId;
    return !item.product_id && !item.order_id;
  });

  const timestamp = nowIso();
  if (!thread) {
    thread = {
      id: memoryChatStore.nextThreadId--,
      customer_id: Number(req.user.id),
      customer_name: req.user.name || null,
      customer_email: req.user.email || null,
      assigned_staff_id: null,
      order_id: Number.isInteger(orderId) && orderId > 0 ? orderId : null,
      product_id: Number.isInteger(productId) && productId > 0 ? productId : null,
      subject: subject || null,
      status: 'open',
      last_message_at: null,
      created_at: timestamp,
      updated_at: timestamp,
      unread_count: 0,
    };
    memoryChatStore.threads.unshift(thread);
    memoryChatStore.participants.push({
      thread_id: thread.id,
      user_id: Number(req.user.id),
      role: req.user.role || 'customer',
      unread_count: 0,
      last_read_at: null,
      created_at: timestamp,
      updated_at: timestamp,
    });
  }

  let message = null;
  if (initialMessage) {
    message = {
      id: memoryChatStore.nextMessageId--,
      thread_id: thread.id,
      sender_id: Number(req.user.id),
      sender_name: req.user.name || null,
      sender_role: req.user.role || 'customer',
      body: initialMessage,
      media_urls: [],
      message_type: 'text',
      order_id: thread.order_id || null,
      seen_at: null,
      created_at: timestamp,
    };
    memoryChatStore.messages.push(message);
    thread.last_message_at = timestamp;
    thread.updated_at = timestamp;
    thread.last_message_body = initialMessage;
    thread.last_message_created_at = timestamp;
  }

  return { status: 201, body: { thread: mapRestThread(thread), message } };
};

const getMemoryThreads = (req) => {
  const rows = memoryChatStore.threads
    .filter((thread) => isStaffUser(req.user) || Number(thread.customer_id) === Number(req.user.id))
    .sort((a, b) => new Date(b.last_message_at || b.updated_at || b.created_at) - new Date(a.last_message_at || a.updated_at || a.created_at))
    .map(mapRestThread);
  return rows;
};

const getMemoryThread = (threadId, user) => {
  const thread = memoryChatStore.threads.find((item) => Number(item.id) === Number(threadId));
  if (!thread || !assertThreadAccess(thread, user)) return null;
  const messages = memoryChatStore.messages
    .filter((message) => Number(message.thread_id) === Number(thread.id))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || Number(a.id) - Number(b.id));
  return { thread: mapRestThread(thread), messages };
};

const sendMemoryMessage = (req, threadId, body, mediaUrls, messageType) => {
  const found = getMemoryThread(threadId, req.user);
  if (!found) return { status: 404, body: { message: 'Chat not found' } };
  if (found.thread.status === 'blocked') return { status: 403, body: { message: 'This chat is blocked' } };

  const timestamp = nowIso();
  const message = {
    id: memoryChatStore.nextMessageId--,
    thread_id: Number(threadId),
    sender_id: Number(req.user.id),
    sender_name: req.user.name || null,
    sender_role: req.user.role || 'customer',
    body: body || '',
    media_urls: mediaUrls,
    message_type: messageType,
    order_id: found.thread.order_id || null,
    seen_at: null,
    created_at: timestamp,
  };
  memoryChatStore.messages.push(message);

  const thread = memoryChatStore.threads.find((item) => Number(item.id) === Number(threadId));
  if (thread) {
    thread.last_message_at = timestamp;
    thread.updated_at = timestamp;
    thread.last_message_body = message.body;
    thread.last_message_created_at = timestamp;
  }

  return { status: 201, body: { message } };
};

export const getThreads = async (req, res) => {
  await chatSchemaReady;
  try {
    const staff = isStaffUser(req.user);
    const params = [];
    let whereClause = 'WHERE 1=1';
    if (!staff) {
      params.push(req.user.id);
      whereClause += ` AND ct.customer_id = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT ct.*, u.name as customer_name, u.email as customer_email,
              staff.name as assigned_staff_name,
              o.status as order_status,
              p.name as product_name,
              COALESCE(cp.unread_count, 0) as unread_count,
              lm.body as last_message_body,
              lm.created_at as last_message_created_at
       FROM chat_threads ct
       LEFT JOIN users u ON u.id = ct.customer_id
       LEFT JOIN users staff ON staff.id = ct.assigned_staff_id
       LEFT JOIN orders o ON o.id = ct.order_id
       LEFT JOIN products p ON p.id = ct.product_id
       LEFT JOIN chat_participants cp ON cp.thread_id = ct.id AND cp.user_id = $${params.push(req.user.id)}
       LEFT JOIN LATERAL (
         SELECT body, created_at
         FROM chat_messages cm
         WHERE cm.thread_id = ct.id
         ORDER BY cm.created_at DESC, cm.id DESC
         LIMIT 1
       ) lm ON true
       ${whereClause}
       ORDER BY COALESCE(ct.last_message_at, ct.updated_at, ct.created_at) DESC`,
      params
    );

    res.json(result.rows.map((thread) => ({
      ...thread,
      unread_count: Number(thread.unread_count || 0),
    })));
  } catch (error) {
    console.error('Get chat threads error:', error);
    res.status(isDatabaseConnectivityError(error) ? 503 : 500).json({ message: 'Persistent chat storage is unavailable.' });
  }
};

export const getThread = async (req, res) => {
  await chatSchemaReady;
  try {
    const thread = await getThreadById(pool, req.params.id);
    if (!thread) return res.status(404).json({ message: 'Chat not found' });
    if (!assertThreadAccess(thread, req.user)) return res.status(403).json({ message: 'Access denied' });

    const messages = await pool.query(
      `SELECT cm.*, u.name as sender_name, u.role as sender_role
       FROM chat_messages cm
       LEFT JOIN users u ON u.id = cm.sender_id
       WHERE cm.thread_id = $1
       ORDER BY cm.created_at ASC, cm.id ASC`,
      [thread.id]
    );

    res.json({ thread, messages: messages.rows });
  } catch (error) {
    console.error('Get chat thread error:', error);
    res.status(isDatabaseConnectivityError(error) ? 503 : 500).json({ message: 'Persistent chat storage is unavailable.' });
  }
};

export const createThread = async (req, res) => {
  await chatSchemaReady;
  const { order_id, product_id } = req.body || {};
  if (!isStaffUser(req.user) && (!Number.isInteger(Number(product_id)) || Number(product_id) <= 0)) {
    return res.status(400).json({ message: 'Product chat requires a valid product.' });
  }
  const subject = sanitizePlainText(req.body?.subject, { maxLength: 255 });
  const initialMessage = sanitizePlainText(req.body?.message, { maxLength: 5000 });
  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const existingParams = [req.user.id];
    let existingWhere = 'customer_id = $1 AND status <> \'blocked\'';
    if (order_id) {
      existingParams.push(Number(order_id));
      existingWhere += ` AND order_id = $${existingParams.length}`;
    } else if (product_id) {
      existingParams.push(Number(product_id));
      existingWhere += ` AND product_id = $${existingParams.length}`;
    } else {
      existingWhere += ' AND order_id IS NULL AND product_id IS NULL';
    }

    const existing = await client.query(
      `SELECT id FROM chat_threads WHERE ${existingWhere} ORDER BY updated_at DESC LIMIT 1`,
      existingParams
    );

    let threadId = existing.rows[0]?.id;
    if (!threadId) {
      const threadResult = await client.query(
        `INSERT INTO chat_threads (customer_id, order_id, product_id, subject)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [req.user.id, order_id || null, product_id || null, subject || null]
      );
      threadId = threadResult.rows[0].id;
      await ensureParticipant(client, threadId, req.user);
    }

    let message = null;
    if (initialMessage) {
      const messageResult = await client.query(
        `INSERT INTO chat_messages (thread_id, sender_id, body, message_type, order_id)
         VALUES ($1, $2, $3, 'text', $4)
         RETURNING *`,
        [threadId, req.user.id, initialMessage, order_id || null]
      );
      message = messageResult.rows[0];
      await client.query('UPDATE chat_threads SET last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [threadId]);
    }

    await client.query('COMMIT');
    const thread = await getThreadById(pool, threadId);
    if (message) emitChatMessage(thread, message);
    res.status(201).json({ thread, message });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
    }
    console.error('Create chat thread error:', error);
    res.status(isDatabaseConnectivityError(error) ? 503 : 500).json({ message: 'Chat was not saved because persistent storage is unavailable.' });
  } finally {
    if (client) {
      client.release();
    }
  }
};

export const sendMessage = async (req, res) => {
  await chatSchemaReady;
  const threadId = Number(req.params.id);
  const body = sanitizePlainText(req.body?.body, { maxLength: 5000 });
  const messageType = MESSAGE_TYPES.has(String(req.body?.message_type || 'text')) ? String(req.body?.message_type || 'text') : 'text';
  const mediaUrls = sanitizeUrlArray(req.body?.media_urls, { maxItems: 6 });

  if (!body && mediaUrls.length === 0) {
    return res.status(400).json({ message: 'Message body or media is required' });
  }

  try {
    const thread = await getThreadById(pool, threadId);
    if (!thread) return res.status(404).json({ message: 'Chat not found' });
    if (!assertThreadAccess(thread, req.user)) return res.status(403).json({ message: 'Access denied' });
    if (thread.status === 'blocked') return res.status(403).json({ message: 'This chat is blocked' });

    await ensureParticipant(pool, threadId, req.user);
    const messageResult = await pool.query(
      `INSERT INTO chat_messages (thread_id, sender_id, body, media_urls, message_type, order_id)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       RETURNING *`,
      [threadId, req.user.id, body || '', JSON.stringify(mediaUrls), messageType, thread.order_id || null]
    );

    const message = messageResult.rows[0];
    await pool.query(
      `UPDATE chat_threads SET last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [threadId]
    );
    await pool.query(
      `UPDATE chat_participants
       SET unread_count = unread_count + 1, updated_at = CURRENT_TIMESTAMP
       WHERE thread_id = $1 AND user_id <> $2`,
      [threadId, req.user.id]
    );

    const updatedThread = await getThreadById(pool, threadId);
    emitChatMessage(updatedThread, message);
    res.status(201).json({ message });
  } catch (error) {
    console.error('Send chat message error:', error);
    res.status(isDatabaseConnectivityError(error) ? 503 : 500).json({ message: 'Message was not saved because persistent storage is unavailable.' });
  }
};

export const markThreadRead = async (req, res) => {
  await chatSchemaReady;
  try {
    const thread = await getThreadById(pool, req.params.id);
    if (!thread) return res.status(404).json({ message: 'Chat not found' });
    if (!assertThreadAccess(thread, req.user)) return res.status(403).json({ message: 'Access denied' });

    await ensureParticipant(pool, thread.id, req.user);
    await pool.query(
      `UPDATE chat_participants
       SET unread_count = 0, last_read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE thread_id = $1 AND user_id = $2`,
      [thread.id, req.user.id]
    );
    await pool.query(
      `UPDATE chat_messages SET seen_at = COALESCE(seen_at, CURRENT_TIMESTAMP)
       WHERE thread_id = $1 AND sender_id <> $2`,
      [thread.id, req.user.id]
    );

    emitChatSeen(thread, { thread_id: thread.id, user_id: req.user.id, seen_at: new Date().toISOString() });
    res.json({ message: 'Chat marked as read' });
  } catch (error) {
    console.error('Mark chat read error:', error);
    res.status(isDatabaseConnectivityError(error) ? 503 : 500).json({ message: 'Chat read state was not saved.' });
  }
};

export const assignThread = async (req, res) => {
  await chatSchemaReady;
  if (!isStaffUser(req.user)) return res.status(403).json({ message: 'Access denied' });

  const assignedStaffId = Number(req.body?.assigned_staff_id || req.user.id);
  try {
    const result = await pool.query(
      `UPDATE chat_threads
       SET assigned_staff_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [assignedStaffId, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Chat not found' });

    await ensureParticipant(pool, req.params.id, { id: assignedStaffId, role: 'store_staff' });
    const thread = await getThreadById(pool, req.params.id);
    emitChatAssigned(thread);
    res.json({ thread });
  } catch (error) {
    console.error('Assign chat error:', error);
    res.status(isDatabaseConnectivityError(error) ? 503 : 500).json({ message: 'Chat assignment was not saved.' });
  }
};

export const getQuickReplies = async (req, res) => {
  await chatSchemaReady;
  try {
    const result = await pool.query(
      `SELECT * FROM chat_quick_replies WHERE is_active = true ORDER BY title ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get quick replies error:', error);
    res.status(500).json({ message: 'Failed to load quick replies' });
  }
};

export const saveQuickReply = async (req, res) => {
  await chatSchemaReady;
  if (!isStaffUser(req.user)) return res.status(403).json({ message: 'Access denied' });
  const title = sanitizePlainText(req.body?.title, { maxLength: 120 });
  const body = sanitizePlainText(req.body?.body, { maxLength: 5000 });
  if (!title || !body) return res.status(400).json({ message: 'Title and body are required' });

  try {
    const result = await pool.query(
      `INSERT INTO chat_quick_replies (title, body, created_by)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [title, body, req.user.id]
    );
    res.status(201).json({ quick_reply: result.rows[0] });
  } catch (error) {
    console.error('Save quick reply error:', error);
    res.status(500).json({ message: 'Failed to save quick reply' });
  }
};
