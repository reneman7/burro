import { io as ioClient } from 'socket.io-client';

const API = 'http://localhost/burro/backend-php/public/api';
const REALTIME = 'http://localhost:4000';

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function login(username, password) {
  const r = await api('/auth/login', { method: 'POST', body: { username, password } });
  return r.token;
}

function decodeUserId(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;
}

async function main() {
  const usernames = ['tr_a', 'tr_b', 'tr_c'];
  const password = 'password123';
  for (const u of usernames) {
    try {
      await api('/auth/register', { method: 'POST', body: { username: u, password } });
    } catch {}
  }
  const tokens = {};
  for (const u of usernames) tokens[u] = await login(u, password);

  const create = await api('/tables', { method: 'POST', token: tokens.tr_a, body: { name: 'Reconexión', ante_value: 1, buy_in: 20 } });
  const { code, id: tableId } = create;
  await api('/tables/join', { method: 'POST', token: tokens.tr_b, body: { code, buy_in: 20 } });
  await api('/tables/join', { method: 'POST', token: tokens.tr_c, body: { code, buy_in: 20 } });
  await api(`/tables/${code}/start`, { method: 'POST', token: tokens.tr_a, body: { mandatory_manos: 5 } });

  const sA = ioClient(REALTIME, { auth: { token: tokens.tr_a } });
  const sB = ioClient(REALTIME, { auth: { token: tokens.tr_b } });
  const sC = ioClient(REALTIME, { auth: { token: tokens.tr_c } });

  await Promise.all([sA, sB, sC].map((s) => new Promise((r) => s.on('connect', r))));
  await Promise.all([sA, sB, sC].map((s) => new Promise((r) => s.emit('game:watch', tableId, r))));

  let sawStateAfterReconnect = false;

  await new Promise((resolve, reject) => {
    sA.emit('game:startPartida', tableId, (res) => (res.ok ? resolve() : reject(new Error(res.error))));
  });

  // Espera a que llegue la fase de intercambio (mano obligatoria, sin decisión de entrada).
  await new Promise((resolve) => {
    sB.on('game:state', function handler(state) {
      if (state.phase === 'exchange') {
        sB.off('game:state', handler);
        resolve();
      }
    });
  });

  console.log('Fase de intercambio en curso. Desconectando a tr_b a mitad de partida...');
  sB.disconnect();
  await new Promise((r) => setTimeout(r, 500));

  console.log('Reconectando tr_b...');
  const sB2 = ioClient(REALTIME, { auth: { token: tokens.tr_b } });
  await new Promise((r) => sB2.on('connect', r));

  const receivedState = await new Promise((resolve) => {
    sB2.emit('game:watch', tableId, () => {});
    sB2.once('game:state', (state) => resolve(state));
  });
  const receivedHand = await new Promise((resolve) => {
    sB2.once('game:yourHand', (h) => resolve(h));
  });

  console.log('Estado recibido tras reconectar:', JSON.stringify(receivedState));
  console.log('Mano recibida tras reconectar:', JSON.stringify(receivedHand));
  sawStateAfterReconnect = receivedState && receivedHand && receivedHand.hand.length === 5;

  console.log(sawStateAfterReconnect ? 'RECONEXIÓN OK: recibió estado + mano de 5 cartas' : 'RECONEXIÓN FALLÓ');

  for (const s of [sA, sB2, sC]) s.close();
  process.exit(sawStateAfterReconnect ? 0 : 1);
}

main().catch((err) => {
  console.error('FALLÓ:', err);
  process.exit(1);
});
