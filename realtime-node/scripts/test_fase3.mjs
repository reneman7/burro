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

function connectSocket(token, label) {
  const socket = ioClient(REALTIME, { auth: { token } });
  socket.on('connect_error', (e) => console.log(`[${label}] connect_error:`, e.message));
  return socket;
}

function logEvents(socket, label) {
  for (const ev of ['game:manoStarted', 'game:state', 'game:yourHand', 'game:yourTurn', 'game:entryDecided', 'game:cardPlayed', 'game:renounced', 'game:trickFinished', 'game:manoResult', 'game:partidaFinished', 'game:paused']) {
    socket.on(ev, (payload) => {
      console.log(`[${label}] ${ev}:`, JSON.stringify(payload));
    });
  }
}

async function main() {
  const usernames = ['tf3_a', 'tf3_b', 'tf3_c'];
  const password = 'password123';

  for (const u of usernames) {
    try {
      await api('/auth/register', { method: 'POST', body: { username: u, password } });
    } catch (e) {
      // ya existe, seguimos
    }
  }

  const tokens = {};
  for (const u of usernames) tokens[u] = await login(u, password);

  // Dar créditos suficientes vía... no hay endpoint aún (Fase 5), así que lo hacemos
  // directo si hace falta -- para esta prueba asumimos que ya tienen créditos
  // (se topean manualmente antes de correr este script si es necesario).

  const createResp = await api('/tables', {
    method: 'POST',
    token: tokens['tf3_a'],
    body: { name: 'Prueba Fase 3', ante_value: 2, buy_in: 20 },
  });
  console.log('Mesa creada:', createResp.code, 'id=', createResp.id);
  const code = createResp.code;
  const tableId = createResp.id;

  await api('/tables/join', { method: 'POST', token: tokens['tf3_b'], body: { code, buy_in: 20 } });
  await api('/tables/join', { method: 'POST', token: tokens['tf3_c'], body: { code, buy_in: 20 } });
  console.log('Los 3 jugadores están en la mesa');

  const startResp = await api(`/tables/${code}/start`, {
    method: 'POST',
    token: tokens['tf3_a'],
    body: { mandatory_manos: 1 },
  });
  console.log('Partida iniciada, status=', startResp.status);

  const sockets = {};
  for (const u of usernames) {
    sockets[u] = connectSocket(tokens[u], u);
    logEvents(sockets[u], u);
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

  for (const u of usernames) {
    await new Promise((resolve) => sockets[u].emit('game:watch', tableId, resolve));
  }
  console.log('Todos viendo la mesa, arrancando partida...');

  await new Promise((resolve, reject) => {
    sockets['tf3_a'].emit('game:startPartida', tableId, (res) => {
      if (!res.ok) return reject(new Error(res.error));
      resolve();
    });
  });

  // Bot simple: cuando le toque a alguien, intercambia 0 cartas o juega la
  // primera opción válida. Escuchamos game:state para saber de quién es el turno.
  const userIdByUsername = {}; // se llena cuando conocemos los ids reales

  function attachBot(username, socket) {
    socket.on('game:yourTurn', ({ validIndexes }) => {
      // No sabemos la fase actual desde este evento solo, así que probamos
      // jugar carta; si la fase real es "exchange" este evento no se emite
      // (solo se emite en fase 'playing'), así que es seguro.
      socket.emit('game:playCard', tableId, validIndexes[0], (res) => {
        if (!res.ok) console.log(`[${username}] error playCard:`, res.error);
      });
    });

    socket.on('game:state', (state) => {
      if (state.phase === 'exchange' && state.turnUserId) {
        // Solo actuamos si el turno es nuestro; lo sabremos comparando en el manejador de abajo.
      }
    });
  }

  // Para saber nuestro propio userId, decodificamos el JWT (payload base64).
  function decodeUserId(token) {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return payload.sub;
  }

  for (const u of usernames) {
    const myId = decodeUserId(tokens[u]);
    sockets[u].on('game:state', (state) => {
      if (state.phase === 'exchange' && state.turnUserId === myId) {
        sockets[u].emit('game:exchange', tableId, [], (res) => {
          if (!res.ok) console.log(`[${u}] error exchange:`, res.error);
        });
      }
      if (state.phase === 'entry' && state.turnUserId === myId) {
        sockets[u].emit('game:decideEntry', tableId, true, (res) => {
          if (!res.ok) console.log(`[${u}] error decideEntry:`, res.error);
        });
      }
    });
    sockets[u].on('game:yourTurn', ({ validIndexes }) => {
      sockets[u].emit('game:playCard', tableId, validIndexes[0], (res) => {
        if (!res.ok) console.log(`[${u}] error playCard:`, res.error);
      });
    });
  }

  await new Promise((resolve) => setTimeout(resolve, 8000));

  console.log('--- fin de la espera, cerrando sockets ---');
  for (const u of usernames) sockets[u].close();
  process.exit(0);
}

main().catch((err) => {
  console.error('FALLÓ:', err);
  process.exit(1);
});
