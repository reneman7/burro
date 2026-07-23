import { io as ioClient } from 'socket.io-client';

const API = 'http://localhost/burro/backend-php/public/api';
const REALTIME = 'http://localhost:4000';
const tableId = Number(process.argv[2]);
const code = process.argv[3];

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

async function login(u) {
  const { token } = await api('/auth/login', { method: 'POST', body: { username: u, password: 'burro1234' } });
  return token;
}

async function main() {
  const tokens = { jugador1: await login('jugador1'), jugador2: await login('jugador2'), jugador3: await login('jugador3') };
  const sockets = {};

  for (const u of Object.keys(tokens)) {
    const myId = decodeUserId(tokens[u]);
    const socket = ioClient(REALTIME, { auth: { token: tokens[u] } });
    sockets[u] = socket;
    await new Promise((r) => socket.on('connect', r));
    await new Promise((r) => socket.emit('game:watch', tableId, r));

    socket.on('game:state', (state) => {
      if (state.phase === 'exchange' && state.turnUserId === myId) socket.emit('game:exchange', tableId, [], () => {});
      if (state.phase === 'entry' && state.turnUserId === myId) socket.emit('game:decideEntry', tableId, true, () => {});
    });
    socket.on('game:yourTurn', ({ validIndexes }) => socket.emit('game:playCard', tableId, validIndexes[0], () => {}));
    socket.on('game:paused', (info) => console.log(`[${u}] PAUSADO:`, JSON.stringify(info)));
    socket.on('game:manoResult', (r) => console.log(`[${u}] manoResult fondo=${r.newFondo} saved=${r.saved}`));
  }

  await new Promise((resolve, reject) => {
    sockets.jugador1.emit('game:startPartida', tableId, (res) => (res.ok ? resolve() : reject(new Error(res.error))));
  });

  await new Promise((r) => setTimeout(r, 4000));

  console.log('--- verificando si quedó pausado ---');
  const balancesBefore = await api(`/tables/${code}`, { token: tokens.jugador1 });
  console.log('Saldos de mesa:', JSON.stringify(balancesBefore.players.map((p) => [p.username, p.table_balance])));

  const shortPlayer = balancesBefore.players.find((p) => p.table_balance < 10);
  if (!shortPlayer) {
    console.log('Nadie quedó corto de fondos todavía; no se puede probar el resume.');
    process.exit(0);
  }

  console.log(`Recargando fichas de mesa para ${shortPlayer.username}...`);
  const shortToken = tokens[shortPlayer.username];
  const topupResp = await api(`/tables/${code}/topup`, { method: 'POST', token: shortToken, body: { amount: 50 } });
  console.log('Topup resp:', JSON.stringify(topupResp));

  await new Promise((resolve, reject) => {
    sockets[shortPlayer.username].emit('game:retryDeal', tableId, (res) => (res.ok ? resolve() : reject(new Error(res.error))));
  });

  await new Promise((r) => setTimeout(r, 3000));
  const afterState = await api(`/tables/${code}`, { token: tokens.jugador1 });
  console.log('Estado de mesa después del retry:', afterState.status);

  for (const s of Object.values(sockets)) s.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('FALLÓ:', err);
  process.exit(1);
});
