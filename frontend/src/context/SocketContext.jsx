import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const REALTIME_URL = import.meta.env.VITE_REALTIME_URL;

const SocketContext = createContext(null);

/**
 * Mantiene UNA sola conexión de Socket.IO por sesión, compartida por toda la
 * app (antes cada componente que llamaba useSocket() abría su propia
 * conexión — el lobby y la mesa de juego terminaban con 2 sockets para el
 * mismo usuario al mismo tiempo, lo cual se veía en los logs de Render como
 * "conectado" duplicado y contribuía a la inestabilidad de la conexión).
 */
export function SocketProvider({ children }) {
  const { token } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (!token) {
      socketRef.current?.close();
      socketRef.current = null;
      setConnected(false);
      return undefined;
    }

    const socket = io(REALTIME_URL, { auth: { token } });
    socketRef.current = socket;
    forceRender((n) => n + 1);

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [token]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected }}>{children}</SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error('useSocket debe usarse dentro de <SocketProvider>');
  }
  return ctx;
}
