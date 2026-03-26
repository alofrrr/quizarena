/**
 * SocketContext.js
 * Provides a singleton Socket.io connection across all React components.
 * Handles auto-reconnection and connection state management.
 */

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:4000';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
      setIsConnected(true);
      setConnectionError(null);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
      setConnectionError(err.message);
      setIsConnected(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const emit = useCallback((event, data, callback) => {
    if (socketRef.current) {
      socketRef.current.emit(event, data, callback);
    }
  }, []);

  const on = useCallback((event, handler) => {
    if (socketRef.current) {
      socketRef.current.on(event, handler);
    }
  }, []);

  const off = useCallback((event, handler) => {
    if (socketRef.current) {
      socketRef.current.off(event, handler);
    }
  }, []);

  const value = {
    socket: socketRef.current,
    isConnected,
    connectionError,
    emit,
    on,
    off,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}

export default SocketContext;
