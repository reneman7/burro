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

async function main() {
  const { token } = await api('/auth/login', { method: 'POST', body: { username: 'jugador1', password: 'burro1234' } });
  const socket = ioClient(REALTIME, { auth: { token } });
  await new Promise((r) => socket.on('connect', r));
  await new Promise((r) => socket.emit('game:watch', tableId, r));

  socket.on('game:manoResult', (r) => console.log('manoResult:', JSON.stringify(r)));
  socket.on('game:partidaFinished', (r) => {
    console.log('partidaFinished:', JSON.stringify(r));
    socket.close();
    process.exit(0);
  });

  setTimeout(() => {
    console.log('timeout esperando partidaFinished');
    process.exit(1);
  }, 30000);
}

main();
