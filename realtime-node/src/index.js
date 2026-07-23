import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { socketAuthMiddleware } from './sockets/auth.js';
import { registerLobbyHandlers } from './sockets/lobby.js';
import { registerGameHandlers } from './sockets/game.js';
import { internalApi } from './api/internalApi.js';

const app = express();
app.use(cors());

app.get('/health', async (_req, res) => {
  try {
    await internalApi.get('/internal/health');
    res.json({ status: 'ok', db: 'ok (via PHP)' });
  } catch (err) {
    res.status(500).json({ status: 'ok', db: 'error', error: err.message });
  }
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

io.use(socketAuthMiddleware);

io.on('connection', (socket) => {
  console.log(`Socket conectado: ${socket.user.username} (id ${socket.user.id})`);

  registerLobbyHandlers(io, socket);
  registerGameHandlers(io, socket);

  socket.on('disconnect', () => {
    console.log(`Socket desconectado: ${socket.user.username}`);
  });
});

const port = process.env.PORT || 4000;
httpServer.listen(port, () => {
  console.log(`Servicio de tiempo real escuchando en puerto ${port}`);
});
