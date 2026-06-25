import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from './config/database.js';
import { PRODUCT_PUBLISHER_ROLE_SET, STAFF_ROLE_SET } from './constants/schemaEnums.js';

let io = null;

const chatRoomName = (conversationId) => `conversation:${conversationId}`;

const canAccessConversation = async (conversationId, user) => {
  if (!conversationId || !user?.id) return null;
  const result = await pool.query(
    `SELECT id, customer_id, seller_id, assigned_staff_id
     FROM chat_threads
     WHERE id = $1
       AND (
         customer_id = $2
         OR seller_id = $2
         OR assigned_staff_id = $2
         OR $3 = true
       )
     LIMIT 1`,
    [conversationId, user.id, STAFF_ROLE_SET.has(user.role)]
  );
  return result.rows[0] || null;
};

const emitToConversationTargets = (thread, event, payload) => {
  if (!io || !thread?.id) return;

  const rooms = new Set([chatRoomName(thread.id), 'staff']);
  if (thread.customer_id) rooms.add(`user:${thread.customer_id}`);
  if (thread.seller_id) rooms.add(`user:${thread.seller_id}`);
  if (thread.assigned_staff_id) rooms.add(`user:${thread.assigned_staff_id}`);

  let target = io;
  for (const room of rooms) {
    target = target.to(room);
  }
  target.emit(event, payload);
};

export function initSocket(httpServer, frontendUrl) {
  io = new Server(httpServer, {
    cors: {
      origin: frontendUrl,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true,
    },
    // LAN-friendly: allow long polling + websockets
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.use(async (socket, next) => {
    try {
      const token = String(socket.handshake.auth?.token || '').trim();
      if (!token || !process.env.JWT_SECRET) return next(new Error('Authentication required'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256'],
        issuer: process.env.JWT_ISSUER || '10th-west-moto-api',
        audience: process.env.JWT_AUDIENCE || '10th-west-moto-web',
        clockTolerance: 30,
      });
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const result = await pool.query(
        `SELECT u.id, u.name, u.email, u.role, u.is_active, u.is_deleted, u.email_verified,
                EXISTS (
                  SELECT 1 FROM permissions p
                  LEFT JOIN role_permissions rp ON rp.permission_id = p.id AND rp.role = u.role
                  LEFT JOIN user_permissions up ON up.permission_id = p.id AND up.user_id = u.id
                  WHERE p.name = 'pos.access' AND COALESCE(up.granted, rp.id IS NOT NULL)
                ) AS can_access_pos,
                EXISTS (
                  SELECT 1 FROM permissions p
                  LEFT JOIN role_permissions rp ON rp.permission_id = p.id AND rp.role = u.role
                  LEFT JOIN user_permissions up ON up.permission_id = p.id AND up.user_id = u.id
                  WHERE p.name = 'orders.view' AND COALESCE(up.granted, rp.id IS NOT NULL)
                ) AS can_view_orders
         FROM users u
         JOIN sessions s ON s.user_id = u.id
         WHERE u.id = $1 AND s.token_hash = $2 AND s.is_active = true AND s.expires_at > NOW()
         LIMIT 1`,
        [decoded.id, tokenHash]
      );
      const user = result.rows[0];
      if (!user || !user.is_active || user.is_deleted || !user.email_verified) {
        return next(new Error('Invalid or inactive session'));
      }
      socket.data.user = user;
      return next();
    } catch {
      return next(new Error('Invalid or expired session'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    console.log(`🔌 Socket connected: ${socket.id}`);
    socket.broadcast.emit('user:online', { user_id: user.id });

    // Join rooms based on user role
    socket.on('join', (data = {}) => {
      // Leave previously joined app rooms first so account switching in the same tab stays isolated.
      const previousRooms = socket.data.joinedRooms || [];
      for (const room of previousRooms) {
        socket.leave(room);
      }
      const joinedRooms = [];

      if (STAFF_ROLE_SET.has(user.role) && user.can_view_orders) {
        socket.join('staff');
        joinedRooms.push('staff');
        console.log(`   ↳ ${socket.id} joined [staff] room`);
      }
      if (PRODUCT_PUBLISHER_ROLE_SET.has(user.role)) {
        socket.join('admin');
        joinedRooms.push('admin');
        console.log(`   ↳ ${socket.id} joined [admin] room`);
      }
      if (user.id) {
        const userRoom = `user:${user.id}`;
        socket.join(userRoom);
        joinedRooms.push(userRoom);
        console.log(`   ↳ ${socket.id} joined [user:${user.id}] room`);
      }
      // POS terminal room
      if (data.isPOS && user.can_access_pos) {
        socket.join('pos');
        joinedRooms.push('pos');
        console.log(`   ↳ ${socket.id} joined [pos] room`);
      }

      socket.data.joinedRooms = joinedRooms;
    });

    // Explicitly leave all app-specific rooms (used on logout).
    socket.on('leaveAll', () => {
      const previousRooms = socket.data.joinedRooms || [];
      for (const room of previousRooms) {
        socket.leave(room);
      }
      socket.data.joinedRooms = [];
      console.log(`   ↳ ${socket.id} left all app rooms`);
    });

    socket.on('chat:typing', async (payload = {}) => {
      const threadId = Number(payload.thread_id || payload.threadId);
      if (!threadId) return;
      try {
        const result = await pool.query(
          `SELECT customer_id, assigned_staff_id
           FROM chat_threads
           WHERE id = $1 AND ($2 = customer_id OR $3 = true)`,
          [threadId, user.id, STAFF_ROLE_SET.has(user.role)]
        );
        const thread = result.rows[0];
        if (!thread) return;
        const safePayload = { thread_id: threadId, user_id: user.id };
        socket.to('staff').emit('chat:typing', safePayload);
        if (thread.customer_id) socket.to(`user:${thread.customer_id}`).emit('chat:typing', safePayload);
        if (thread.assigned_staff_id) socket.to(`user:${thread.assigned_staff_id}`).emit('chat:typing', safePayload);
      } catch {}
    });

    socket.on('chat:join', async (payload = {}) => {
      const conversationId = Number(payload.conversation_id || payload.conversationId || payload.thread_id || payload.threadId);
      if (!conversationId) return;
      try {
        const thread = await canAccessConversation(conversationId, user);
        if (!thread) return;
        socket.join(chatRoomName(conversationId));
        socket.emit('conversation:joined', { conversation_id: conversationId, thread_id: conversationId });
      } catch {}
    });

    socket.on('chat:leave', (payload = {}) => {
      const conversationId = Number(payload.conversation_id || payload.conversationId || payload.thread_id || payload.threadId);
      if (!conversationId) return;
      socket.leave(chatRoomName(conversationId));
    });

    const relayTyping = async (eventName, payload = {}) => {
      const conversationId = Number(payload.conversation_id || payload.conversationId || payload.thread_id || payload.threadId);
      if (!conversationId) return;
      try {
        const thread = await canAccessConversation(conversationId, user);
        if (!thread) return;
        const safePayload = {
          conversation_id: conversationId,
          thread_id: conversationId,
          user_id: user.id,
          is_typing: eventName === 'typing:start',
        };
        socket.to(chatRoomName(conversationId)).emit(eventName, safePayload);
        socket.to(chatRoomName(conversationId)).emit('chat:typing', safePayload);
        socket.to('staff').emit(eventName, safePayload);
        if (thread.customer_id) socket.to(`user:${thread.customer_id}`).emit(eventName, safePayload);
        if (thread.seller_id) socket.to(`user:${thread.seller_id}`).emit(eventName, safePayload);
        if (thread.assigned_staff_id) socket.to(`user:${thread.assigned_staff_id}`).emit(eventName, safePayload);
      } catch {}
    };

    socket.on('typing:start', (payload = {}) => {
      relayTyping('typing:start', payload);
    });

    socket.on('typing:stop', (payload = {}) => {
      relayTyping('typing:stop', payload);
    });

    socket.on('disconnect', (reason) => {
      console.log(`🔌 Socket disconnected: ${socket.id} (${reason})`);
      socket.broadcast.emit('user:offline', { user_id: user.id });
    });
  });

  console.log('⚡ Socket.IO initialized');
  return io;
}

export function getIO() {
  if (!io) {
    throw new Error('Socket.IO not initialized — call initSocket first');
  }
  return io;
}

// ==================== EVENT EMITTERS ====================

// Orders
export function emitNewOrder(order) {
  if (!io) return;
  io.to('staff').emit('order:new', order);
  if (order.user_id) {
    io.to(`user:${order.user_id}`).emit('order:new', order);
  }
}

const emitOrderPayload = (order) => {
  if (!io || !order) return;
  io.to('staff').emit('order:updated', order);
  if (order.user_id) {
    io.to(`user:${order.user_id}`).emit('order:updated', order);
  }
};

export function emitOrderStatusUpdate(orderOrId, status = null, extra = {}) {
  if (!io) return;
  if (orderOrId && typeof orderOrId === 'object') {
    emitOrderPayload(orderOrId);
    return;
  }

  const orderId = Number(orderOrId);
  if (!Number.isInteger(orderId) || orderId <= 0) return;

  const fallbackPayload = { id: orderId, order_id: orderId, ...(status ? { status } : {}), ...extra };
  io.to('staff').emit('order:updated', fallbackPayload);

  pool.query(
    `SELECT id, user_id, status, payment_status, tracking_number, courier, waybill_number,
            waybill_status, updated_at
     FROM orders
     WHERE id = $1`,
    [orderId]
  ).then((result) => {
    const order = result.rows[0];
    if (order) emitOrderPayload({ ...order, ...extra });
  }).catch((error) => {
    console.error('Failed to resolve order for socket update:', error.message || error);
  });
}

// Products
export function emitProductCreated(product) {
  if (!io) return;
  io.emit('product:created', product);
}

export function emitProductUpdated(product) {
  if (!io) return;
  io.emit('product:updated', product);
}

export function emitProductDeleted(productId) {
  if (!io) return;
  io.emit('product:deleted', { id: productId });
}

// Inventory / Stock
export function emitStockUpdate(data) {
  if (!io) return;
  io.to('staff').emit('inventory:updated', data);
  // Also broadcast to POS so product grid refreshes
  io.to('pos').emit('inventory:updated', data);
}

export function emitLowStockAlert(product) {
  if (!io) return;
  io.to('staff').emit('inventory:low-stock', product);
}

// Returns
export function emitReturnCreated(returnReq) {
  if (!io) return;
  io.to('staff').emit('return:new', returnReq);
  if (returnReq.user_id) {
    io.to(`user:${returnReq.user_id}`).emit('return:new', returnReq);
  }
}

export function emitReturnUpdated(returnReq) {
  if (!io) return;
  io.to('staff').emit('return:updated', returnReq);
  if (returnReq.user_id) {
    io.to(`user:${returnReq.user_id}`).emit('return:updated', returnReq);
  }
}

// Notifications (generic)
export function emitNotification(target, notification) {
  if (!io) return;
  if (target === 'all') {
    io.emit('notification', notification);
  } else if (target === 'staff') {
    io.to('staff').emit('notification', notification);
  } else {
    io.to(`user:${target}`).emit('notification', notification);
  }
}

// Chat
export function emitChatMessage(thread, message) {
  if (!io) return;
  emitToConversationTargets(thread, 'chat:message', { thread, message });
  emitToConversationTargets(thread, 'message:new', {
    conversation: thread,
    thread,
    message,
  });
}

export function emitChatSeen(thread, payload) {
  if (!io) return;
  emitToConversationTargets(thread, 'chat:seen', payload);
  emitToConversationTargets(thread, 'message:read', payload);
}

export function emitChatAssigned(thread) {
  if (!io) return;
  emitToConversationTargets(thread, 'chat:assigned', thread);
  emitToConversationTargets(thread, 'conversation:updated', thread);
}

export function emitConversationMessage(thread, message) {
  if (!io) return;
  emitToConversationTargets(thread, 'message:new', {
    conversation: thread,
    thread,
    message,
  });
}

export function emitConversationRead(thread, payload) {
  if (!io) return;
  emitToConversationTargets(thread, 'message:read', payload);
  emitToConversationTargets(thread, 'chat:seen', payload);
}

export function emitConversationUpdated(thread, conversation = thread) {
  if (!io) return;
  emitToConversationTargets(thread, 'conversation:updated', conversation);
}
