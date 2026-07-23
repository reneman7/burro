import { io as ioClient } from 'socket.io-client';

const API = 'http://localhost/burro/backend-php/public/api';
const REALTIME = 'http://localhost:4000';
const tableId = Number(process.argv[2]);

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function login(u) {
  const { token } = await api('/auth/login', { method: 'POST', body: { username: u, password: 'burro1234' } });
  return token;
}

async function main() {
  const token = await login('jugador1');
  const socket = ioClient(REALTIME, { auth: { token } });

  await new Promise((r) => socket.on('connect', r));
  await new Promise((r) => socket.emit('game:watch', tableId, r));

  socket.on('game:state', (s) => {
    if (s.phase === 'exchange') socket.emit('game:exchange', tableId, [], () => {});
    if (s.phase === 'entry') socket.emit('game:decideEntry', tableId, true, () => {});
  });
  socket.on('game:yourTurn', ({ validIndexes }) => socket.emit('game:playCard', tableId, validIndexes[0], () => {}));
  socket.on('game:manoResult', (r) => console.log('manoResult:', JSON.stringify(r)));
  socket.on('game:partidaFinished', (r) => {
    console.log('partidaFinished:', JSON.stringify(r));
    socket.close();
    process.exit(0);
  });

  await new Promise((resolve, reject) => {
    socket.emit('game:startPartida', tableId, (res) => (res.ok ? resolve() : reject(new Error(res.error))));
  });

  setTimeout(() => {
    console.log('timeout, saliendo sin partidaFinished');
    process.exit(1);
  }, 20000);
}

main().catch((err) => {
  console.error('FALLÓ:', err);
  process.exit(1);
});
