import pool from '../config/database.js';
import { STAFF_ROLE_SET } from '../constants/schemaEnums.js';
import {
  emitChatMessage,
  emitConversationRead,
  emitConversationUpdated,
} from '../socket.js';
import { createNotification } from '../utils/notifications.js';
import { sanitizePlainText, sanitizeUrlArray } from '../utils/inputSanitizer.js';

const STAFF_ROLES = STAFF_ROLE_SET;
const MESSAGE_TYPES = new Set(['text', 'image', 'video', 'file', 'system']);

const isStaffUser = (user) => STAFF_ROLES.has(String(user?.role || '').toLowerCase());

const toPositiveInt = (value) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const safeLimit = (value, fallback = 50, max = 100) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

const parseJsonValue = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const parseMediaUrls = (value) => {
  const parsed = parseJsonValue(value, []);
  return Array.isArray(parsed) ? parsed : [];
};

const firstImageFromJson = (value) => {
  const images = parseJsonValue(value, []);
  return Array.isArray(images) && images.length > 0 ? images[0] : null;
};

const resolveMessageType = (value, attachmentUrls = []) => {
  const requested = String(value || 'text').toLowerCase();
  if (MESSAGE_TYPES.has(requested)) return requested;
  if (attachmentUrls.length > 0) return 'image';
  return 'text';
};

const normalizeProductSnapshot = (row) => {
  if (!row) return {};

  const optionCombination = parseJsonValue(row.variant_option_combination, null);
  const imageUrl = row.variant_image_url || row.image || firstImageFromJson(row.image_urls);
  const variant = row.variant_id
    ? {
        id: row.variant_id,
        label: row.variant_label || null,
        sku: row.variant_sku || null,
        price: row.variant_price != null ? Number(row.variant_price) : null,
        stock_quantity: row.variant_stock_quantity != null ? Number(row.variant_stock_quantity) : null,
        option_combination: optionCombination || {},
        image_url: row.variant_image_url || null,
      }
    : null;

  return {
    id: row.id,
    name: row.name,
    part_number: row.part_number || null,
    sku: row.sku || null,
    brand: row.brand || null,
    category_name: row.category_name || null,
    price: Number(row.price || 0),
    sale_price: row.sale_price != null ? Number(row.sale_price) : null,
    stock_quantity: Number(row.stock_quantity || 0),
    status: row.status || null,
    image_url: imageUrl || null,
    variant,
  };
};

const fetchProductSnapshot = async (db, productId, variantId = null) => {
  const result = await db.query(
    `SELECT p.id, p.name, p.part_number, p.sku, p.brand, p.price, p.sale_price,
            p.stock_quantity, p.status, p.image, p.image_urls, c.name AS category_name,
            pv.id AS variant_id,
            pv.variant_value AS variant_label,
            pv.sku AS variant_sku,
            pv.price AS variant_price,
            pv.stock_quantity AS variant_stock_quantity,
            pv.option_combination AS variant_option_combination,
            pv.image_url AS variant_image_url
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN product_variants pv ON pv.id = $2 AND pv.product_id = p.id
     WHERE p.id = $1 AND COALESCE(p.is_deleted, false) = false
     LIMIT 1`,
    [productId, variantId]
  );

  const row = result.rows[0];
  if (!row) return null;
  if (variantId && !row.variant_id) {
    const error = new Error('Selected product variant is unavailable.');
    error.status = 400;
    throw error;
  }

  return normalizeProductSnapshot(row);
};

const fetchDefaultSellerId = async (db) => {
  const result = await db.query(
    `SELECT id
     FROM users
     WHERE role IN ('owner', 'admin', 'store_staff')
       AND COALESCE(is_active, true) = true
       AND COALESCE(is_deleted, false) = false
     ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, id
     LIMIT 1`
  );
  return result.rows[0]?.id || null;
};

const ensureParticipant = async (db, conversationId, userId, role) => {
  if (!conversationId || !userId) return;
  await db.query(
    `INSERT INTO chat_participants (thread_id, conversation_id, user_id, role)
     VALUES ($1, $1, $2, $3)
     ON CONFLICT (thread_id, user_id)
     DO UPDATE SET
       conversation_id = EXCLUDED.conversation_id,
       role = EXCLUDED.role,
       updated_at = CURRENT_TIMESTAMP`,
    [conversationId, userId, role || 'customer']
  );
};

const conversationSelect = (viewerParamIndex = 2) => `
  SELECT ct.*,
         buyer.name AS buyer_name,
         buyer.email AS buyer_email,
         buyer.avatar AS buyer_avatar,
         seller.name AS seller_name,
         seller.email AS seller_email,
         assignee.name AS assigned_staff_name,
         p.name AS product_name,
         p.image AS product_image,
         p.image_urls AS product_image_urls,
         COALESCE(cp.unread_count, 0) AS participant_unread_count,
         lm.body AS latest_body,
         lm.message_text AS latest_message_text,
         lm.created_at AS latest_created_at,
         lm.sender_id AS latest_sender_id
  FROM chat_threads ct
  LEFT JOIN users buyer ON buyer.id = ct.customer_id
  LEFT JOIN users seller ON seller.id = ct.seller_id
  LEFT JOIN users assignee ON assignee.id = ct.assigned_staff_id
  LEFT JOIN products p ON p.id = ct.product_id
  LEFT JOIN chat_participants cp ON cp.thread_id = ct.id AND cp.user_id = $${viewerParamIndex}
  LEFT JOIN LATERAL (
    SELECT body, message_text, created_at, sender_id
    FROM chat_messages cm
    WHERE cm.thread_id = ct.id AND cm.deleted_at IS NULL
    ORDER BY cm.created_at DESC, cm.id DESC
    LIMIT 1
  ) lm ON true
`;

const getConversationById = async (db, conversationId, viewerId = null) => {
  const result = await db.query(
    `${conversationSelect(2)}
     WHERE ct.id = $1
     LIMIT 1`,
    [conversationId, viewerId]
  );
  return result.rows[0] || null;
};

const canAccessConversation = (conversation, user) => {
  if (!conversation || !user) return false;
  if (isStaffUser(user)) return true;
  return Number(conversation.customer_id) === Number(user.id);
};

const mapMessage = (row) => {
  const mediaUrls = parseMediaUrls(row.media_urls);
  const attachmentUrl = row.attachment_url || mediaUrls[0] || null;

  return {
    id: row.id,
    conversation_id: row.conversation_id || row.thread_id,
    thread_id: row.thread_id,
    sender_id: row.sender_id,
    receiver_id: row.receiver_id || null,
    sender_name: row.sender_name || null,
    sender_role: row.sender_role || null,
    message_text: row.message_text ?? row.body ?? '',
    body: row.body ?? row.message_text ?? '',
    message_type: row.message_type || 'text',
    media_urls: mediaUrls,
    attachment_url: attachmentUrl,
    attachment_type: row.attachment_type || null,
    metadata: parseJsonValue(row.metadata, {}),
    is_read: Boolean(row.is_read || row.seen_at || row.read_at),
    read_at: row.read_at || row.seen_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
  };
};

const mapConversation = (row, user) => {
  if (!row) return null;
  const viewerIsStaff = isStaffUser(user);
  const snapshot = parseJsonValue(row.product_snapshot, {});
  const productImage = row.product_image || firstImageFromJson(row.product_image_urls);
  const product = snapshot?.id
    ? snapshot
    : {
        id: row.product_id,
        name: row.product_name || row.subject || 'Product',
        image_url: productImage || null,
      };

  const unreadCount = viewerIsStaff
    ? Number(row.seller_unread_count ?? row.participant_unread_count ?? 0)
    : Number(row.buyer_unread_count ?? row.participant_unread_count ?? 0);

  const isArchived = viewerIsStaff ? Boolean(row.seller_archived_at) : Boolean(row.buyer_archived_at);
  const status = row.status === 'open' && !isArchived ? 'active' : row.status;

  return {
    id: row.id,
    conversation_id: row.id,
    thread_id: row.id,
    buyer_id: row.customer_id,
    customer_id: row.customer_id,
    buyer_name: row.buyer_name || 'Customer',
    buyer_email: row.buyer_email || null,
    buyer_avatar: row.buyer_avatar || null,
    seller_id: row.seller_id || row.assigned_staff_id || null,
    seller_name: row.seller_name || row.assigned_staff_name || '10th West Moto',
    assigned_staff_id: row.assigned_staff_id || null,
    assigned_staff_name: row.assigned_staff_name || null,
    product_id: row.product_id,
    variant_id: row.variant_id,
    order_id: row.order_id,
    subject: row.subject || product?.name || 'Product chat',
    status,
    raw_status: row.status,
    conversation_type: row.conversation_type || 'product',
    product,
    product_snapshot: product,
    is_pinned: Boolean(row.is_pinned),
    is_archived: isArchived,
    buyer_archived_at: row.buyer_archived_at || null,
    seller_archived_at: row.seller_archived_at || null,
    unread_count: unreadCount,
    buyer_unread_count: Number(row.buyer_unread_count || 0),
    seller_unread_count: Number(row.seller_unread_count || 0),
    last_message_id: row.last_message_id || null,
    last_message_text: row.last_message_text || row.latest_message_text || row.latest_body || '',
    last_message_at: row.last_message_at || row.latest_created_at || row.updated_at || row.created_at,
    last_sender_id: row.latest_sender_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

const listConversations = async (req, res, { seller = false } = {}) => {
  const params = [req.user.id];
  const filters = ['1=1'];
  const limit = safeLimit(req.query.limit);
  const search = sanitizePlainText(req.query.search || req.query.q, { maxLength: 120 });
  const status = sanitizePlainText(req.query.status, { maxLength: 30 });

  if (seller) {
    if (!isStaffUser(req.user)) return res.status(403).json({ message: 'Seller chat access required' });
  } else {
    filters.push(`ct.customer_id = $${params.length + 1}`);
    params.push(req.user.id);
  }

  if (seller) {
    if (status === 'archived') {
      filters.push('ct.seller_archived_at IS NOT NULL');
    } else {
      filters.push('ct.seller_archived_at IS NULL');
      filters.push("ct.status <> 'blocked'");
    }

    if (status === 'unread') filters.push('ct.seller_unread_count > 0');
    if (status === 'pinned') filters.push('ct.is_pinned = true');
    if (status === 'closed') filters.push("ct.status = 'closed'");
    if (status === 'active') filters.push("ct.status = 'open'");
  } else {
    if (status === 'archived') {
      filters.push('ct.buyer_archived_at IS NOT NULL');
    } else {
      filters.push('ct.buyer_archived_at IS NULL');
    }
    if (status === 'unread') filters.push('ct.buyer_unread_count > 0');
    filters.push("ct.status <> 'blocked'");
  }

  if (search) {
    params.push(`%${search}%`);
    const index = params.length;
    filters.push(`(
      buyer.name ILIKE $${index}
      OR buyer.email ILIKE $${index}
      OR p.name ILIKE $${index}
      OR ct.subject ILIKE $${index}
      OR ct.last_message_text ILIKE $${index}
    )`);
  }

  params.push(limit);
  const result = await pool.query(
    `${conversationSelect(1)}
     WHERE ${filters.join(' AND ')}
     ORDER BY ct.is_pinned DESC, COALESCE(ct.last_message_at, ct.updated_at, ct.created_at) DESC
     LIMIT $${params.length}`,
    params
  );

  res.json({
    conversations: result.rows.map((row) => mapConversation(row, req.user)),
  });
};

const createChatMessage = async (db, conversation, user, payload = {}) => {
  const messageText = sanitizePlainText(
    payload.message_text ?? payload.body ?? payload.message,
    { maxLength: 5000, allowNewlines: true }
  );
  const mediaUrls = sanitizeUrlArray(payload.media_urls || payload.attachments, { maxItems: 6 });
  const attachmentUrl = sanitizePlainText(payload.attachment_url, { maxLength: 500 });
  const allMediaUrls = attachmentUrl && !mediaUrls.includes(attachmentUrl)
    ? [attachmentUrl, ...mediaUrls]
    : mediaUrls;
  const messageType = resolveMessageType(payload.message_type, allMediaUrls);

  if (!messageText && allMediaUrls.length === 0) {
    const error = new Error('Message text or attachment is required');
    error.status = 400;
    throw error;
  }

  const senderIsStaff = isStaffUser(user);
  const receiverId = senderIsStaff
    ? conversation.customer_id
    : (conversation.assigned_staff_id || conversation.seller_id || null);

  const result = await db.query(
    `INSERT INTO chat_messages (
       thread_id, conversation_id, sender_id, receiver_id, sender_role,
       body, message_text, media_urls, message_type, attachment_url, attachment_type,
       order_id, metadata, is_read, created_at, updated_at
     ) VALUES (
       $1, $1, $2, $3, $4,
       $5, $5, $6::jsonb, $7, $8, $9,
       $10, $11::jsonb, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
     )
     RETURNING *`,
    [
      conversation.id,
      user.id,
      receiverId,
      user.role || (senderIsStaff ? 'store_staff' : 'customer'),
      messageText || '',
      JSON.stringify(allMediaUrls),
      messageType,
      allMediaUrls[0] || null,
      payload.attachment_type || (messageType === 'text' ? null : messageType),
      conversation.order_id || null,
      JSON.stringify(payload.metadata || {}),
    ]
  );

  const message = result.rows[0];

  await db.query(
    `UPDATE chat_threads
     SET last_message_id = $2,
         last_message_text = $3,
         last_message_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP,
         buyer_unread_count = CASE WHEN $4 THEN buyer_unread_count + 1 ELSE buyer_unread_count END,
         seller_unread_count = CASE WHEN $4 THEN seller_unread_count ELSE seller_unread_count + 1 END,
         buyer_archived_at = CASE WHEN $4 THEN NULL ELSE buyer_archived_at END,
         seller_archived_at = CASE WHEN $4 THEN seller_archived_at ELSE NULL END
     WHERE id = $1`,
    [conversation.id, message.id, messageText || '[attachment]', senderIsStaff]
  );

  await ensureParticipant(db, conversation.id, user.id, user.role || (senderIsStaff ? 'store_staff' : 'customer'));
  if (receiverId) {
    await ensureParticipant(db, conversation.id, receiverId, senderIsStaff ? 'customer' : 'store_staff');
  }

  await db.query(
    `UPDATE chat_participants
     SET unread_count = CASE WHEN user_id = $2 THEN unread_count ELSE unread_count + 1 END,
         updated_at = CURRENT_TIMESTAMP
     WHERE thread_id = $1`,
    [conversation.id, user.id]
  );

  return message;
};

const notifyRecipient = async (db, conversation, sender, message) => {
  const senderIsStaff = isStaffUser(sender);
  const targetUserId = senderIsStaff
    ? conversation.customer_id
    : (conversation.seller_id || conversation.assigned_staff_id);

  if (!targetUserId || Number(targetUserId) === Number(sender.id)) return;

  const snapshot = parseJsonValue(conversation.product_snapshot, {});
  const title = senderIsStaff
    ? 'Seller replied to your chat'
    : 'New product chat message';
  const senderName = sender.name || (senderIsStaff ? '10th West Moto' : 'Customer');
  const productName = snapshot?.name || conversation.product_name || conversation.subject || 'a product';

  await createNotification(db, {
    user_id: targetUserId,
    type: 'chat.message',
    title,
    message: `${senderName}: ${message.message_text || message.body || 'Sent an attachment'}`,
    reference_id: conversation.id,
    reference_type: 'chat',
    thumbnail_url: snapshot?.image_url || null,
    metadata: {
      conversation_id: conversation.id,
      product_id: conversation.product_id,
      product_name: productName,
      sender_id: sender.id,
    },
  }).catch((error) => {
    console.error('Chat notification error:', error.message);
  });
};

export const startProductConversation = async (req, res) => {
  const productId = toPositiveInt(req.body?.product_id);
  const variantId = toPositiveInt(req.body?.variant_id);
  const initialMessage = sanitizePlainText(
    req.body?.initial_message ?? req.body?.message,
    { maxLength: 5000, allowNewlines: true }
  ) || null;

  if (!productId) {
    return res.status(400).json({ message: 'A valid product_id is required.' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const productSnapshot = await fetchProductSnapshot(client, productId, variantId);
    if (!productSnapshot) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Product not found' });
    }

    const sellerId = await fetchDefaultSellerId(client);
    const existing = await client.query(
      `SELECT id
       FROM chat_threads
       WHERE customer_id = $1
         AND product_id = $2
         AND COALESCE(variant_id, 0) = COALESCE($3, 0)
         AND status NOT IN ('closed', 'blocked')
       ORDER BY updated_at DESC
       LIMIT 1`,
      [req.user.id, productId, variantId]
    );

    let conversationId = existing.rows[0]?.id || null;
    let created = false;

    if (!conversationId) {
      const inserted = await client.query(
        `INSERT INTO chat_threads (
           customer_id, seller_id, product_id, variant_id, subject, status,
           conversation_type, product_snapshot, last_message_at, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, 'open',
           'product', $6::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         )
         RETURNING id`,
        [
          req.user.id,
          sellerId,
          productId,
          variantId,
          productSnapshot.name || `Product #${productId}`,
          JSON.stringify(productSnapshot),
        ]
      );
      conversationId = inserted.rows[0].id;
      created = true;
    } else {
      await client.query(
        `UPDATE chat_threads
         SET seller_id = COALESCE(seller_id, $2),
             product_snapshot = $3::jsonb,
             buyer_archived_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [conversationId, sellerId, JSON.stringify(productSnapshot)]
      );
    }

    await ensureParticipant(client, conversationId, req.user.id, 'customer');
    if (sellerId) {
      await ensureParticipant(client, conversationId, sellerId, 'store_staff');
    }

    let message = null;
    if (initialMessage && created) {
      const conversation = await getConversationById(client, conversationId, req.user.id);
      message = await createChatMessage(client, conversation, req.user, { message_text: initialMessage });
      await notifyRecipient(client, conversation, req.user, message);
    }

    await client.query('COMMIT');

    const conversationRow = await getConversationById(pool, conversationId, req.user.id);
    const conversation = mapConversation(conversationRow, req.user);

    if (message) {
      const mappedMessage = mapMessage({ ...message, sender_name: req.user.name, sender_role: req.user.role });
      emitChatMessage(conversationRow, mappedMessage);
    } else {
      emitConversationUpdated(conversationRow, conversation);
    }

    res.status(created ? 201 : 200).json({ conversation, message: message ? mapMessage(message) : null, created });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Start product chat error:', error);
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Failed to start product chat' });
  } finally {
    if (client) client.release();
  }
};

export const getMyConversations = (req, res) => listConversations(req, res, { seller: false });

export const getSellerConversations = (req, res) => listConversations(req, res, { seller: true });

export const getConversationMessages = async (req, res) => {
  const conversationId = toPositiveInt(req.params.conversationId || req.params.id);
  if (!conversationId) return res.status(400).json({ message: 'Invalid conversation id' });

  try {
    const conversation = await getConversationById(pool, conversationId, req.user.id);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    if (!canAccessConversation(conversation, req.user)) return res.status(403).json({ message: 'Access denied' });

    const limit = safeLimit(req.query.limit, 100, 200);
    const result = await pool.query(
      `SELECT cm.*, u.name AS sender_name, u.avatar AS sender_avatar
       FROM chat_messages cm
       LEFT JOIN users u ON u.id = cm.sender_id
       WHERE cm.thread_id = $1 AND cm.deleted_at IS NULL
       ORDER BY cm.created_at ASC, cm.id ASC
       LIMIT $2`,
      [conversationId, limit]
    );

    res.json({
      conversation: mapConversation(conversation, req.user),
      messages: result.rows.map(mapMessage),
    });
  } catch (error) {
    console.error('Get conversation messages error:', error);
    res.status(500).json({ message: 'Failed to load messages' });
  }
};

export const getSellerConversation = getConversationMessages;

export const sendConversationMessage = async (req, res) => {
  const conversationId = toPositiveInt(req.params.conversationId || req.params.id);
  if (!conversationId) return res.status(400).json({ message: 'Invalid conversation id' });

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const conversation = await getConversationById(client, conversationId, req.user.id);
    if (!conversation) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Conversation not found' });
    }
    if (!canAccessConversation(conversation, req.user)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Access denied' });
    }
    if (conversation.status === 'blocked' || conversation.status === 'closed') {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'This conversation is closed.' });
    }

    const message = await createChatMessage(client, conversation, req.user, req.body || {});
    await notifyRecipient(client, conversation, req.user, message);

    await client.query('COMMIT');

    const updatedConversationRow = await getConversationById(pool, conversationId, req.user.id);
    const messagePayload = mapMessage({
      ...message,
      sender_name: req.user.name,
      sender_role: req.user.role,
    });
    const conversationPayload = mapConversation(updatedConversationRow, req.user);

    emitChatMessage(updatedConversationRow, messagePayload);
    emitConversationUpdated(updatedConversationRow, conversationPayload);

    res.status(201).json({ message: messagePayload, conversation: conversationPayload });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Send conversation message error:', error);
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Failed to send message' });
  } finally {
    if (client) client.release();
  }
};

export const markConversationRead = async (req, res) => {
  const conversationId = toPositiveInt(req.params.conversationId || req.params.id);
  if (!conversationId) return res.status(400).json({ message: 'Invalid conversation id' });

  try {
    const conversation = await getConversationById(pool, conversationId, req.user.id);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    if (!canAccessConversation(conversation, req.user)) return res.status(403).json({ message: 'Access denied' });

    await ensureParticipant(pool, conversationId, req.user.id, req.user.role || 'customer');
    await pool.query(
      `UPDATE chat_participants
       SET unread_count = 0, last_read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE thread_id = $1 AND user_id = $2`,
      [conversationId, req.user.id]
    );

    if (isStaffUser(req.user)) {
      await pool.query('UPDATE chat_threads SET seller_unread_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [conversationId]);
    } else {
      await pool.query('UPDATE chat_threads SET buyer_unread_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [conversationId]);
    }

    await pool.query(
      `UPDATE chat_messages
       SET is_read = true,
           read_at = COALESCE(read_at, CURRENT_TIMESTAMP),
           seen_at = COALESCE(seen_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE thread_id = $1 AND sender_id <> $2 AND deleted_at IS NULL`,
      [conversationId, req.user.id]
    );

    const readPayload = {
      conversation_id: conversationId,
      thread_id: conversationId,
      user_id: req.user.id,
      read_at: new Date().toISOString(),
    };
    emitConversationRead(conversation, readPayload);
    res.json({ message: 'Conversation marked as read', ...readPayload });
  } catch (error) {
    console.error('Mark conversation read error:', error);
    res.status(500).json({ message: 'Failed to mark conversation read' });
  }
};

export const archiveSellerConversation = async (req, res) => {
  if (!isStaffUser(req.user)) return res.status(403).json({ message: 'Seller chat access required' });
  const conversationId = toPositiveInt(req.params.conversationId || req.params.id);
  const archived = req.body?.archived !== false;

  try {
    const result = await pool.query(
      `UPDATE chat_threads
       SET seller_archived_at = CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [conversationId, archived]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Conversation not found' });

    const conversationRow = await getConversationById(pool, conversationId, req.user.id);
    const conversation = mapConversation(conversationRow, req.user);
    emitConversationUpdated(conversationRow, conversation);
    res.json({ conversation });
  } catch (error) {
    console.error('Archive seller conversation error:', error);
    res.status(500).json({ message: 'Failed to update archive state' });
  }
};

export const pinSellerConversation = async (req, res) => {
  if (!isStaffUser(req.user)) return res.status(403).json({ message: 'Seller chat access required' });
  const conversationId = toPositiveInt(req.params.conversationId || req.params.id);
  const pinned = req.body?.pinned !== false;

  try {
    const result = await pool.query(
      `UPDATE chat_threads
       SET is_pinned = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [conversationId, pinned]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Conversation not found' });

    const conversationRow = await getConversationById(pool, conversationId, req.user.id);
    const conversation = mapConversation(conversationRow, req.user);
    emitConversationUpdated(conversationRow, conversation);
    res.json({ conversation });
  } catch (error) {
    console.error('Pin seller conversation error:', error);
    res.status(500).json({ message: 'Failed to update pin state' });
  }
};

export const getSellerUnreadCount = async (req, res) => {
  if (!isStaffUser(req.user)) return res.status(403).json({ message: 'Seller chat access required' });

  try {
    const result = await pool.query(
      `SELECT COALESCE(SUM(seller_unread_count), 0)::int AS count
       FROM chat_threads
       WHERE seller_archived_at IS NULL AND status <> 'blocked'`
    );
    res.json({ count: Number(result.rows[0]?.count || 0) });
  } catch (error) {
    console.error('Get seller unread chat count error:', error);
    res.status(500).json({ message: 'Failed to load unread count' });
  }
};
