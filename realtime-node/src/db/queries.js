import { internalApi } from '../api/internalApi.js';

export async function getAdminSetting(key) {
  const { value } = await internalApi.get(`/internal/settings/${key}`);
  return value;
}

/** Jugadores activos de una mesa, en orden de asiento (orden de turno). */
export async function getSeatOrder(tableId) {
  const { players } = await internalApi.get(`/internal/tables/${tableId}/seat-order`);
  return players;
}

export async function getActivePartida(tableId) {
  const { partida } = await internalApi.get(`/internal/tables/${tableId}/active-partida`);
  return partida;
}

/** Determina el dealer de la próxima mano: rota a la derecha respecto al último dealer histórico de la mesa. */
export async function determineNextDealer(tableId) {
  const { dealer_user_id: dealerId } = await internalApi.get(`/internal/tables/${tableId}/next-dealer`);
  return dealerId;
}

/** Cuántas manos ya se jugaron en esta partida (para saber si la siguiente es obligatoria). */
export async function countManosInPartida(partidaId) {
  const { count } = await internalApi.get(`/internal/partidas/${partidaId}/mano-count`);
  return count;
}

export async function createManoRow({ partidaId, manoNumber, dealerId, isMandatory, trumpSuit, fondoBefore }) {
  const { id } = await internalApi.post('/internal/manos', {
    partida_id: partidaId,
    mano_number: manoNumber,
    dealer_id: dealerId,
    is_mandatory: isMandatory,
    trump_suit: trumpSuit,
    fondo_before: fondoBefore,
  });
  return id;
}

export async function finalizeManoRow(manoId, { fondoAfter }) {
  await internalApi.post(`/internal/manos/${manoId}/finalize`, { fondo_after: fondoAfter });
}

export async function insertManoPlayers(manoId, entrantsInfo) {
  await internalApi.post(`/internal/manos/${manoId}/players`, { entrants: entrantsInfo });
}

export async function insertTricks(manoId, tricks) {
  await internalApi.post(`/internal/manos/${manoId}/tricks`, { tricks });
}

/**
 * Aplica los movimientos de créditos de una mano ya resuelta: descuenta la
 * penalización a los no-salvados, abona el pago a los salvados, y ajusta el
 * fondo acumulado de la partida. Cada movimiento queda registrado en el ledger.
 */
export async function applyManoPayments({ tableId, partidaId, manoId, payments }) {
  await internalApi.post(`/internal/manos/${manoId}/apply-payments`, {
    table_id: tableId,
    partida_id: partidaId,
    payments,
  });
}

/** Cobra la apuesta de entrada de la mano a TODOS los jugadores activos de la mesa (automático). */
export async function chargeAnte({ tableId, partidaId, seatOrderIds, anteValue }) {
  await internalApi.post(`/internal/partidas/${partidaId}/charge-ante`, {
    table_id: tableId,
    seat_order_ids: seatOrderIds,
    ante_value: anteValue,
  });
}

export async function getTableBalances(tableId) {
  const { balances } = await internalApi.get(`/internal/tables/${tableId}/balances`);
  return balances;
}

/** Reparte el fondo acumulado (fin de partida) entre los salvados de la última mano y cierra la partida. */
export async function finalizePartida({ tableId, partidaId, saved, fondo }) {
  await internalApi.post(`/internal/partidas/${partidaId}/finalize`, {
    table_id: tableId,
    saved,
    fondo,
  });
}
