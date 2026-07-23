import { drawCards, discardCards } from './shoe.js';

/**
 * Intercambia hasta `maxExchange` cartas de la mano de un jugador contra la
 * baraja. `discardIndexes` son posiciones (0-based) dentro de `hand` que el
 * jugador eligió descartar; puede ser un arreglo vacío (0 cartas cambiadas,
 * el valor por defecto si se agota el timeout de 30s).
 *
 * @returns {{ hand: object[], shoe: object }}
 */
export function exchangeCards(shoe, hand, discardIndexes, maxExchange) {
  const uniqueIndexes = [...new Set(discardIndexes)];

  if (uniqueIndexes.length > maxExchange) {
    throw new Error(`Solo se pueden cambiar hasta ${maxExchange} cartas`);
  }
  for (const i of uniqueIndexes) {
    if (i < 0 || i >= hand.length) {
      throw new Error(`Índice de carta inválido para intercambiar: ${i}`);
    }
  }

  const toDiscard = uniqueIndexes.map((i) => hand[i]);
  const keptHand = hand.filter((_, i) => !uniqueIndexes.includes(i));

  const { drawn, shoe: shoeAfterDraw } = drawCards(shoe, toDiscard.length);
  const shoeAfterDiscard = discardCards(shoeAfterDraw, toDiscard);

  return { hand: [...keptHand, ...drawn], shoe: shoeAfterDiscard };
}
