import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

// Build socket URL dynamically: same host as the page, port 5000
function getSocketUrl() {
  // If env variable is set, use it
  const envUrl = import.meta.env?.VITE_API_URL;
  if (envUrl) {
    // Strip /api suffix to get base URL
    return envUrl.replace(/\/api\/?$/, '');
  }
  // Auto-detect: use current hostname (works on LAN)
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  return `${protocol}://${window.location.hostname}:5000`;
}

const SocketContext = createContext({
  socket: null,
  connected: false,
  on: () => {},
  off: () => {},
});

export const useSocket = () => useContext(SocketContext);

/**
 * Custom hook: subscribe to a socket event. Automatically cleans up on unmount.
 * Usage: useSocketEvent('order:new', (order) => { ... });
 */
export function useSocketEvent(event, handler) {
  const { on, off } = useSocket();

  useEffect(() => {
    on(event, handler);
    return () => off(event, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
}

export const SocketProvider = ({ children }) => {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const url = getSocketUrl();
    console.log(`ðŸ”Œ Connecting to Socket.IO at ${url}`);

    const s = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socketRef.current = s;

    s.on('connect', () => {
      console.log('ðŸ”Œ Socket connected:', s.id);
      setConnected(true);

      // Auto-join rooms based on stored user
      try {
        const savedUser = localStorage.getItem('shopCoreUser');
        if (savedUser) {
          const user = JSON.parse(savedUser);
          s.emit('join', {
            userId: user.id,
            role: user.role,
            isPOS: window.location.hash?.includes('/pos'),
          });
        }
      } catch {}
    });

    s.on('disconnect', () => {
      console.log('ðŸ”Œ Socket disconnected');
      setConnected(false);
    });

    s.on('connect_error', (err) => {
      console.warn('ðŸ”Œ Socket connection error:', err.message);
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, []);

  const on = (event, handler) => {
    socketRef.current?.on(event, handler);
  };

  const off = (event, handler) => {
    socketRef.current?.off(event, handler);
  };

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected, on, off }}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketContext;
