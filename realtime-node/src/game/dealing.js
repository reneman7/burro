import { drawCards, discardCards } from './shoe.js';

/**
 * Reparte una mano: 5 cartas de golpe a cada jugador, en el orden dado
 * (que debe empezar con el jugador a la derecha del dealer y terminar en el
 * dealer mismo), y luego voltea una carta más como triunfo.
 *
 * @param {object} shoe
 * @param {string[]|number[]} seatOrderFromDealerRight - ids de jugadores en orden de reparto
 * @returns {{ hands: Record<string, object[]>, trumpCard: object, shoe: object }}
 */
export function dealMano(shoe, seatOrderFromDealerRight) {
  let currentShoe = shoe;
  const hands = {};

  for (const userId of seatOrderFromDealerRight) {
    const { drawn, shoe: nextShoe } = drawCards(currentShoe, 5);
    hands[userId] = drawn;
    currentShoe = nextShoe;
  }

  const { drawn: trumpDrawn, shoe: shoeAfterTrump } = drawCards(currentShoe, 1);
  const trumpCard = trumpDrawn[0];

  return { hands, trumpCard, shoe: shoeAfterTrump };
}

/**
 * Recoge todas las cartas de una mano que ya terminó (las de las bazas jugadas,
 * el triunfo, y cualquier carta que haya quedado en mano de jugadores
 * eliminados por renuncia o que no entraron) de vuelta al montón de descarte.
 */
export function collectManoCards(shoe, cards) {
  return discardCards(shoe, cards);
}
