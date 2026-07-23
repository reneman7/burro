import { io as ioClient } from 'socket.io-client';

const API = 'http://localhost/burro/backend-php/public/api';
const REALTIME = 'http://localhost:4000';
const tableId = Number(process.argv[2]);
const usernames = process.argv.slice(3);

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function decodeUserId(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;
}

async function main() {
  for (const u of usernames) {
    const { token } = await api('/auth/login', { method: 'POST', body: { username: u, password: 'burro1234' } });
    const myId = decodeUserId(token);
    const socket = ioClient(REALTIME, { auth: { token } });

    socket.on('connect', () => {
      console.log(`[bot ${u}] conectado`);
      socket.emit('game:watch', tableId, () => {});
    });

    socket.on('game:state', (state) => {
      if (state.phase === 'exchange' && state.turnUserId === myId) {
        console.log(`[bot ${u}] intercambia 0 cartas`);
        socket.emit('game:exchange', tableId, [], () => {});
      }
      if (state.phase === 'entry' && state.turnUserId === myId) {
        console.log(`[bot ${u}] decide entrar`);
        socket.emit('game:decideEntry', tableId, true, () => {});
      }
    });

    socket.on('game:yourTurn', ({ validIndexes }) => {
      console.log(`[bot ${u}] juega índice ${validIndexes[0]}`);
      socket.emit('game:playCard', tableId, validIndexes[0], () => {});
    });

    socket.on('game:manoResult', (r) => console.log(`[bot ${u}] manoResult:`, JSON.stringify(r)));
    socket.on('game:partidaFinished', (r) => console.log(`[bot ${u}] partidaFinished:`, JSON.stringify(r)));
  }
}

main();
