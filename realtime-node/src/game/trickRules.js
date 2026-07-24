import { rankValue } from './deck.js';

/**
 * Calcula qué cartas de `hand` son jugadas válidas dado el estado actual de
 * la baza.
 *
 * - Si el jugador lidera la baza (ledSuit === null): cualquier carta es válida.
 * - Si tiene cartas del palo pedido: SOLO esas son válidas (sigue palo
 *   obligatorio, aunque no superen nada; jugar otra cosa teniendo el palo
 *   pedido es renuncia, manejada fuera de este módulo al rechazar la jugada).
 * - Si NO tiene el palo pedido: libertad total, cualquier carta de la mano es
 *   válida (nunca es obligatorio triunfar, ni antes ni después de que alguien
 *   ya haya triunfado en la baza).
 * - "Me achico" es solo una etiqueta informativa (no restringe nada): se
 *   marca cuando el jugador no tiene el palo pedido, ya se jugó un triunfo en
 *   la baza, tiene triunfo(s) en mano, pero ninguno supera al más alto ya
 *   jugado.
 *
 * @param {object[]} hand
 * @param {{ ledSuit: string|null, trumpPlayed: boolean, highestTrumpRank: string|null }} trickState
 * @param {string} trumpSuit
 * @returns {{ validIndexes: number[], isAchico: boolean }}
 */
export function getValidPlays(hand, trickState, trumpSuit) {
  const { ledSuit, trumpPlayed, highestTrumpRank } = trickState;
  const allIndexes = hand.map((_, i) => i);

  if (ledSuit === null) {
    return { validIndexes: allIndexes, isAchico: false };
  }

  const ledSuitIndexes = indexesWhere(hand, (c) => c.suit === ledSuit);
  if (ledSuitIndexes.length > 0) {
    return { validIndexes: ledSuitIndexes, isAchico: false };
  }

  const trumpIndexes = indexesWhere(hand, (c) => c.suit === trumpSuit);
  const hasBeatingTrump = trumpPlayed && trumpIndexes.some((i) => rankValue(hand[i].rank) > rankValue(highestTrumpRank));
  const isAchico = trumpPlayed && trumpIndexes.length > 0 && !hasBeatingTrump;

  return { validIndexes: allIndexes, isAchico };
}

/**
 * Determina el ganador de una baza ya completa.
 * @param {Array<{ userId: any, card: object }>} plays en orden de juego
 * @param {string} ledSuit
 * @param {string} trumpSuit
 * @returns {any} userId ganador
 */
export function resolveTrickWinner(plays, ledSuit, trumpSuit) {
  const trumpPlays = plays.filter((p) => p.card.suit === trumpSuit);
  const candidates = trumpPlays.length > 0 ? trumpPlays : plays.filter((p) => p.card.suit === ledSuit);

  return candidates.reduce((best, p) => (rankValue(p.card.rank) > rankValue(best.card.rank) ? p : best))
    .userId;
}

function indexesWhere(hand, predicate) {
  const result = [];
  hand.forEach((card, i) => {
    if (predicate(card)) result.push(i);
  });
  return result;
}
