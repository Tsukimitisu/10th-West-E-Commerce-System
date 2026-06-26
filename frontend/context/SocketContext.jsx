import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { ToastContainer } from '../components/Toast';
import { getCurrentAuthUser } from '../services/authSession.js';

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
  emit: () => {},
  toast: () => {},
});

export const useSocket = () => useContext(SocketContext);

export function useSocketEvent(event, handler) {
  const { on, off } = useSocket();

  useEffect(() => {
    on(event, handler);
    return () => off(event, handler);
  }, [event, handler]);
}

export const SocketProvider = ({ children }) => {
  const socketRef = useRef(null);
  const joinedSignatureRef = useRef('');
  const lastSessionToastAtRef = useRef(0);
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
    const initialUser = getCurrentAuthUser();

    const s = io(url, {
      withCredentials: true,
      autoConnect: Boolean(initialUser?.id),
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    const emitJoinFromStorage = (force = false) => {
      try {
        const user = getCurrentAuthUser();
        if (!user?.id) {
          if (force || joinedSignatureRef.current) {
            s.emit('leaveAll');
            joinedSignatureRef.current = '';
          }
          return;
        }

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
        // Ignore transient auth state changes.
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

    const onAuthChanged = () => {
      const nextUser = getCurrentAuthUser();
      if (!nextUser?.id) {
        if (s.connected) {
          s.emit('leaveAll');
          s.disconnect();
        }
        joinedSignatureRef.current = '';
        return;
      }
      if (!s.connected) s.connect();
      emitJoinFromStorage(true);
    };
    const onSessionExpired = () => {
      const now = Date.now();
      if (now - lastSessionToastAtRef.current < 2000) return;
      lastSessionToastAtRef.current = now;
      addToast('Your session expired. Please sign in again.', 'error');
    };
    const onFocus = () => emitJoinFromStorage(false);
    const syncInterval = setInterval(() => emitJoinFromStorage(false), 5000);

    window.addEventListener('auth:changed', onAuthChanged);
    window.addEventListener('auth:session-expired', onSessionExpired);
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(syncInterval);
      window.removeEventListener('auth:changed', onAuthChanged);
      window.removeEventListener('auth:session-expired', onSessionExpired);
      window.removeEventListener('focus', onFocus);
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

  const emit = (event, payload) => {
    socketRef.current?.emit(event, payload);
  };

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected, on, off, emit, toast: addToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </SocketContext.Provider>
  );
};

export default SocketContext;


