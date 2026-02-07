import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

// Build socket URL dynamically: same host as the page, port 5000
function getSocketUrl(): string {
  // If env variable is set, use it
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl) {
    // Strip /api suffix to get base URL
    return envUrl.replace(/\/api\/?$/, '');
  }
  // Auto-detect: use current hostname (works on LAN)
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  return `${protocol}://${window.location.hostname}:5000`;
}

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  on: (event: string, handler: (...args: any[]) => void) => void;
  off: (event: string, handler: (...args: any[]) => void) => void;
}

const SocketContext = createContext<SocketContextType>({
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
export function useSocketEvent(event: string, handler: (...args: any[]) => void) {
  const { on, off } = useSocket();

  useEffect(() => {
    on(event, handler);
    return () => off(event, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
}

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const url = getSocketUrl();
    console.log(`🔌 Connecting to Socket.IO at ${url}`);

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
      console.log('🔌 Socket connected:', s.id);
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
      console.log('🔌 Socket disconnected');
      setConnected(false);
    });

    s.on('connect_error', (err: Error) => {
      console.warn('🔌 Socket connection error:', err.message);
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, []);

  const on = (event: string, handler: (...args: any[]) => void) => {
    socketRef.current?.on(event, handler);
  };

  const off = (event: string, handler: (...args: any[]) => void) => {
    socketRef.current?.off(event, handler);
  };

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected, on, off }}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketContext;
