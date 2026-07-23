import jwt from 'jsonwebtoken';

/**
 * Middleware de Socket.IO: verifica el JWT emitido por el backend PHP
 * (mismo secreto, algoritmo HS256) y adjunta el usuario autenticado al socket.
 */
export function socketAuthMiddleware(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('No autenticado'));
  }

  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    socket.user = {
      id: claims.sub,
      username: claims.username,
      role: claims.role,
    };
    next();
  } catch (err) {
    next(new Error('Token inválido o expirado'));
  }
}
