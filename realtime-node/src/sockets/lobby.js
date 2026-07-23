import { internalApi } from '../api/internalApi.js';

export function roomName(tableId) {
  return `table:${tableId}`;
}

/**
 * Carga el estado actual de una mesa (info + jugadores sentados) vía la API
 * interna de PHP (que sí puede llegar a MySQL). Es la misma forma que expone
 * TableController::getTableState, para difundir por socket sin duplicar la
 * lógica. Exportada para que gameRoom.js pueda avisarle al lobby cuando una
 * partida termina sola (sin que ningún cliente haya disparado una llamada REST).
 */
export async function loadTableState(tableId) {
  const { state } = await internalApi.get(`/internal/tables/${tableId}/state`);
  return state;
}

/**
 * Registra los handlers de la sala de espera (lobby) para un socket ya
 * autenticado. El backend PHP sigue siendo la fuente de verdad para crear
 * mesas, unirse, cambiar apuesta e iniciar partida (vía REST); este canal
 * solo difunde el estado resultante en tiempo real a todos los que estén
 * mirando esa mesa.
 */
export function registerLobbyHandlers(io, socket) {
  socket.on('table:watch', async (tableId, ack) => {
    try {
      const id = Number(tableId);
      socket.join(roomName(id));
      const state = await loadTableState(id);
      if (typeof ack === 'function') ack({ ok: true, state });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('table:unwatch', (tableId) => {
    socket.leave(roomName(Number(tableId)));
  });

  // El cliente dispara este evento después de que una llamada REST (crear,
  // unirse, cambiar apuesta, iniciar partida) responde con éxito, para que
  // el servidor vuelva a leer el estado autoritativo de la DB y lo difunda
  // a todos los que estén viendo esa mesa (incluyendo al que disparó el cambio).
  socket.on('table:refresh', async (tableId) => {
    const id = Number(tableId);
    const state = await loadTableState(id);
    if (state) {
      io.to(roomName(id)).emit('table:state', state);
    }
  });
}
