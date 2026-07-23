import { rankValue } from './deck.js';

/**
 * Calcula qué cartas de `hand` son jugadas válidas dado el estado actual de
 * la baza. Reglas (validadas exhaustivamente con el diseño del juego):
 *
 * - Si el jugador lidera la baza (ledSuit === null): cualquier carta es válida.
 * - Si aún no se ha bajado ningún triunfo en esta baza:
 *     - Si tiene cartas del palo pedido: SOLO esas son válidas (sigue palo
 *       obligatorio; no puede triunfar voluntariamente teniendo el palo).
 *     - Si no tiene el palo pedido pero sí tiene triunfo(s): SOLO los
 *       triunfos son válidos (debe triunfar, cualquiera de sus triunfos).
 *     - Si no tiene ni el palo pedido ni triunfo: cualquier carta es válida
 *       (no hay "me achico" aquí, es simplemente libre porque no puede hacer
 *       otra cosa).
 * - Si ya se bajó un triunfo en esta baza:
 *     - Válidas = (sus cartas del palo pedido) ∪ (sus triunfos que superen
 *       al triunfo más alto ya jugado). Puede elegir cualquiera de las dos
 *       categorías si tiene ambas.
 *     - Si ese conjunto queda vacío: "me achico", cualquier carta es válida.
 *       Si el conjunto NO está vacío pero el jugador juega otra carta fuera
 *       de él, eso es una renuncia (se maneja fuera de este módulo, al
 *       rechazar la jugada).
 *
 * @param {object[]} hand
 * @param {{ ledSuit: string|null, trumpPlayed: boolean, highestTrumpRank: string|null }} trickState
 * @param {string} trumpSuit
 * @returns {{ validIndexes: number[], isAchico: boolean }}
 */
export function getValidPlays(hand, trickState, trumpSuit) {
  const { ledSuit, trumpPlayed, highestTrumpRank } = trickState;

  if (ledSuit === null) {
    return { validIndexes: hand.map((_, i) => i), isAchico: false };
  }

  const ledSuitIndexes = indexesWhere(hand, (c) => c.suit === ledSuit);
  const trumpIndexes = indexesWhere(hand, (c) => c.suit === trumpSuit);

  if (!trumpPlayed) {
    if (ledSuitIndexes.length > 0) {
      return { validIndexes: ledSuitIndexes, isAchico: false };
    }
    if (trumpIndexes.length > 0) {
      return { validIndexes: trumpIndexes, isAchico: false };
    }
    return { validIndexes: hand.map((_, i) => i), isAchico: false };
  }

  const higherTrumpIndexes = indexesWhere(
    hand,
    (c) => c.suit === trumpSuit && rankValue(c.rank) > rankValue(highestTrumpRank)
  );
  const validIndexes = [...new Set([...ledSuitIndexes, ...higherTrumpIndexes])];

  if (validIndexes.length === 0) {
    return { validIndexes: hand.map((_, i) => i), isAchico: true };
  }

  return { validIndexes, isAchico: false };
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
