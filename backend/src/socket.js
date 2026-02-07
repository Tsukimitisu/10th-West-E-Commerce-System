import { Server } from 'socket.io';

let io = null;

export function initSocket(httpServer, frontendUrl) {
  io = new Server(httpServer, {
    cors: {
      origin: function (origin, callback) {
        // Allow all LAN and localhost origins
        callback(null, true);
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true,
    },
    // LAN-friendly: allow long polling + websockets
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // Join rooms based on user role
    socket.on('join', (data) => {
      if (data.role === 'admin' || data.role === 'cashier' || data.role === 'manager') {
        socket.join('staff');
        console.log(`   ↳ ${socket.id} joined [staff] room`);
      }
      if (data.role === 'admin') {
        socket.join('admin');
        console.log(`   ↳ ${socket.id} joined [admin] room`);
      }
      if (data.userId) {
        socket.join(`user:${data.userId}`);
        console.log(`   ↳ ${socket.id} joined [user:${data.userId}] room`);
      }
      // POS terminal room
      if (data.isPOS) {
        socket.join('pos');
        console.log(`   ↳ ${socket.id} joined [pos] room`);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`🔌 Socket disconnected: ${socket.id} (${reason})`);
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

export function emitOrderStatusUpdate(order) {
  if (!io) return;
  io.to('staff').emit('order:updated', order);
  if (order.user_id) {
    io.to(`user:${order.user_id}`).emit('order:updated', order);
  }
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
