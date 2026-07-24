import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { socketAuthMiddleware } from './sockets/auth.js';
import { registerLobbyHandlers } from './sockets/lobby.js';
import { registerGameHandlers } from './sockets/game.js';
import { internalApi } from './api/internalApi.js';
import { roomName as lobbyRoomName, loadTableState } from './sockets/lobby.js';

const app = express();
app.use(cors());
app.use(express.json());

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

/**
 * PHP llama esto directamente (no vía socket) cada vez que crea una mesa,
 * alguien se une, cambia la apuesta, inicia partida o recarga fichas — así
 * el aviso a los demás jugadores en la sala de espera no depende de que el
 * socket del jugador que hizo la acción esté listo en ese momento preciso
 * (eso causaba que hubiera que refrescar el navegador para ver a alguien
 * nuevo sentado en la mesa).
 */
app.post('/notify/table-changed', async (req, res) => {
  if (req.header('X-Internal-Key') !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'no autorizado' });
  }
  const tableId = Number(req.body?.tableId);
  if (!tableId) {
    return res.status(400).json({ error: 'falta tableId' });
  }
  try {
    const state = await loadTableState(tableId);
    if (state) {
      io.to(lobbyRoomName(tableId)).emit('table:state', state);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
