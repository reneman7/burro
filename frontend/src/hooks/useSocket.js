import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';

const REALTIME_URL = import.meta.env.VITE_REALTIME_URL;

/**
 * Mantiene una única conexión de Socket.IO mientras haya un usuario autenticado.
 * Se reconecta automáticamente si el token cambia (login/logout).
 */
export function useSocket() {
  const { token } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) {
      socketRef.current?.close();
      socketRef.current = null;
      setConnected(false);
      return;
    }

    const socket = io(REALTIME_URL, { auth: { token } });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [token]);

  return { socket: socketRef.current, connected };
}
