import { createDeck, shuffle } from './deck.js';

/**
 * El "shoe" es la baraja de una partida: se reparte progresivamente a través
 * de varias manos SIN volver a barajar entre cada una. Solo cuando ya no
 * alcanzan cartas para la siguiente mano, se recicla: se junta todo lo
 * descartado (cartas jugadas, triunfos anteriores, cartas de jugadores que
 * quedaron eliminados a mitad de mano) junto con lo que quede sin repartir,
 * y se rebaraja como una baraja de 52 completa.
 *
 * Todas las funciones son puras: reciben un shoe y devuelven uno nuevo.
 */

export function createShoe() {
  return { deck: shuffle(createDeck()), discard: [] };
}

/**
 * Saca `count` cartas del shoe. Recicla automáticamente si no alcanzan.
 * @returns {{ drawn: object[], shoe: { deck: object[], discard: object[] } }}
 */
export function drawCards(shoe, count) {
  let { deck, discard } = shoe;

  if (deck.length < count) {
    deck = shuffle([...deck, ...discard]);
    discard = [];
  }

  if (deck.length < count) {
    // Solo puede pasar si count > 52, lo cual sería un error de uso del motor.
    throw new Error('No hay suficientes cartas en la baraja incluso después de reciclar');
  }

  const drawn = deck.slice(0, count);
  const remaining = deck.slice(count);

  return { drawn, shoe: { deck: remaining, discard } };
}

/** Envía cartas al montón de descarte (se reciclarán en el próximo `drawCards` que lo necesite). */
export function discardCards(shoe, cards) {
  return { deck: shoe.deck, discard: [...shoe.discard, ...cards] };
}
