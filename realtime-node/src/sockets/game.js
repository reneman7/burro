import { getOrCreateGameRoom } from '../runtime/registry.js';

/**
 * Handlers de socket para la partida en curso de una mesa. La autoridad del
 * juego vive en GameRoom/ManoRuntime (servidor); estos handlers solo
 * traducen eventos de socket a llamadas al motor y devuelven errores de
 * validación al cliente que los disparó (nunca confiamos en el cliente para
 * decidir si una jugada es válida).
 */
export function registerGameHandlers(io, socket) {
  const userId = socket.user.id;

  // El cliente llama esto al entrar a la pantalla de una mesa (incluida la
  // reconexión): se registra para recibir el estado y su mano privada.
  socket.on('game:watch', async (tableId, ack) => {
    try {
      const room = getOrCreateGameRoom(io, Number(tableId));
      await room.registerSocket(userId, socket);
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('game:unwatch', (tableId) => {
    const room = getOrCreateGameRoom(io, Number(tableId));
    room.unregisterSocket(userId, socket);
  });

  // Disparado por el cliente que llamó con éxito al REST de iniciar partida.
  socket.on('game:startPartida', async (tableId, ack) => {
    try {
      const room = getOrCreateGameRoom(io, Number(tableId));
      await room.startPartida();
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('game:decideEntry', (tableId, entered, ack) => {
    respondToAction(ack, () => {
      const room = getOrCreateGameRoom(io, Number(tableId));
      room.handleDecideEntry(userId, entered);
    });
  });

  socket.on('game:exchange', (tableId, discardIndexes, ack) => {
    respondToAction(ack, () => {
      const room = getOrCreateGameRoom(io, Number(tableId));
      room.handleExchange(userId, discardIndexes);
    });
  });

  socket.on('game:playCard', (tableId, cardIndex, ack) => {
    respondToAction(ack, () => {
      const room = getOrCreateGameRoom(io, Number(tableId));
      room.handlePlayCard(userId, cardIndex);
    });
  });

  // Disparado por el cliente después de recargar fichas de mesa vía REST,
  // por si la partida estaba pausada esperando esos fondos.
  socket.on('game:retryDeal', async (tableId, ack) => {
    try {
      const room = getOrCreateGameRoom(io, Number(tableId));
      await room.retryDealIfPaused();
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('disconnect', () => {
    // No removemos al jugador de la partida: solo se desregistra el socket.
    // Si se reconecta, `game:watch` lo vuelve a enganchar sin perder su lugar.
    for (const tableId of socket.rooms) {
      if (tableId.startsWith('game:')) {
        const room = getOrCreateGameRoom(io, Number(tableId.slice('game:'.length)));
        room.unregisterSocket(userId, socket);
      }
    }
  });
}

function respondToAction(ack, fn) {
  try {
    fn();
    if (typeof ack === 'function') ack({ ok: true });
  } catch (err) {
    if (typeof ack === 'function') ack({ ok: false, error: err.message });
  }
}
