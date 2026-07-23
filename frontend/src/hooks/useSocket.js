// Reexporta el hook desde el contexto compartido: toda la app debe usar UNA
// sola conexión de socket (ver context/SocketContext.jsx para el porqué).
export { useSocket } from '../context/SocketContext';
