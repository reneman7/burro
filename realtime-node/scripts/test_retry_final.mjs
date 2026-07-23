import { io as ioClient } from 'socket.io-client';

const API = 'http://localhost/burro/backend-php/public/api';
const REALTIME = 'http://localhost:4000';
const tableId = 8;

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
  const token = await login('jugador3');
  const socket = ioClient(REALTIME, { auth: { token } });
  await new Promise((r) => socket.on('connect', r));
  await new Promise((r) => socket.emit('game:watch', tableId, r));

  socket.on('game:manoStarted', (p) => console.log('manoStarted:', JSON.stringify(p)));
  socket.on('game:paused', (p) => console.log('paused:', JSON.stringify(p)));

  await new Promise((resolve, reject) => {
    socket.emit('game:retryDeal', tableId, (res) => (res.ok ? resolve() : reject(new Error(res.error))));
  });

  await new Promise((r) => setTimeout(r, 2000));
  socket.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('FALLÓ:', err);
  process.exit(1);
});
