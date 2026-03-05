import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { ToastContainer } from '../components/Toast';

function getSocketUrl() {
  const envUrl = import.meta.env?.VITE_API_URL;
  if (envUrl) return envUrl.replace(/\/api\/?$/, '');
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  return `${protocol}://${window.location.hostname}:5000`;
}

const SocketContext = createContext({
  socket: null,
  connected: false,
  on: () => {},
  off: () => {},
  toast: () => {},
});

export const useSocket = () => useContext(SocketContext);

export function useSocketEvent(event, handler) {
  const { on, off } = useSocket();

  useEffect(() => {
    on(event, handler);
    return () => off(event, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, handler]);
}

export const SocketProvider = ({ children }) => {
  const socketRef = useRef(null);
  const joinedSignatureRef = useRef('');
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    const url = getSocketUrl();
    console.log(`[Socket] connecting to ${url}`);

    const s = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    const emitJoinFromStorage = (force = false) => {
      try {
        const savedUser = localStorage.getItem('shopCoreUser');
        if (!savedUser) {
          if (force || joinedSignatureRef.current) {
            s.emit('leaveAll');
            joinedSignatureRef.current = '';
          }
          return;
        }

        const user = JSON.parse(savedUser);
        if (!user?.id) return;

        const payload = {
          userId: user.id,
          role: user.role,
          isPOS: window.location.hash?.includes('/pos'),
        };

        const signature = `${payload.userId}:${payload.role}:${payload.isPOS ? 'pos' : 'web'}`;
        if (!force && joinedSignatureRef.current === signature) return;

        s.emit('join', payload);
        joinedSignatureRef.current = signature;
      } catch {
        // Ignore malformed localStorage values.
      }
    };

    socketRef.current = s;

    s.on('connect', () => {
      console.log('[Socket] connected', s.id);
      setConnected(true);
      emitJoinFromStorage(true);
    });

    s.on('disconnect', () => {
      console.log('[Socket] disconnected');
      setConnected(false);
    });

    s.on('connect_error', (err) => {
      console.warn('[Socket] connect error:', err.message);
    });

    s.on('order:new', (order) => {
      addToast(`New order placed! #${order.id?.toString().padStart(4, '0')}`, 'order');
    });

    s.on('order:updated', (order) => {
      addToast(`Order #${order.id?.toString().padStart(4, '0')} status updated to ${order.status}`, 'info');
    });

    s.on('inventory:low-stock', (product) => {
      addToast(`Low stock alert: ${product.name} (${product.stock_quantity} left)`, 'error');
    });

    const onAuthChanged = () => emitJoinFromStorage(true);
    const onFocus = () => emitJoinFromStorage(false);
    const onStorage = (event) => {
      if (event.key === 'shopCoreUser' || event.key === 'shopCoreToken') {
        emitJoinFromStorage(true);
      }
    };
    const syncInterval = setInterval(() => emitJoinFromStorage(false), 5000);

    window.addEventListener('auth:changed', onAuthChanged);
    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);

    return () => {
      clearInterval(syncInterval);
      window.removeEventListener('auth:changed', onAuthChanged);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
      s.disconnect();
      socketRef.current = null;
      joinedSignatureRef.current = '';
    };
  }, []);

  const on = (event, handler) => {
    socketRef.current?.on(event, handler);
  };

  const off = (event, handler) => {
    socketRef.current?.off(event, handler);
  };

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected, on, off, toast: addToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </SocketContext.Provider>
  );
};

export default SocketContext;
