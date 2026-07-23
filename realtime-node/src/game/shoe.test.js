import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShoe, drawCards, discardCards } from './shoe.js';
import { cardCode } from './deck.js';

test('drawCards saca N cartas y reduce el mazo', () => {
  const shoe = createShoe();
  const { drawn, shoe: next } = drawCards(shoe, 5);

  assert.equal(drawn.length, 5);
  assert.equal(next.deck.length, 47);
  assert.equal(shoe.deck.length, 52, 'drawCards no debe mutar el shoe original');
});

test('drawCards recicla automáticamente cuando no alcanzan cartas', () => {
  let shoe = createShoe();
  // Vacía casi todo el mazo hacia el descarte para forzar un reciclaje.
  const { drawn: bulk, shoe: afterBulk } = drawCards(shoe, 50);
  shoe = discardCards(afterBulk, bulk);
  assert.equal(shoe.deck.length, 2);
  assert.equal(shoe.discard.length, 50);

  const { drawn, shoe: afterRecycle } = drawCards(shoe, 5);
  assert.equal(drawn.length, 5);
  assert.equal(afterRecycle.discard.length, 0, 'el descarte se vacía al reciclar');
  assert.equal(afterRecycle.deck.length, 47);
});

test('reciclar conserva las 52 cartas totales (ninguna se pierde ni se duplica)', () => {
  let shoe = createShoe();
  const { drawn, shoe: afterDraw } = drawCards(shoe, 45);
  shoe = discardCards(afterDraw, drawn);

  const { drawn: more, shoe: afterMore } = drawCards(shoe, 10); // fuerza reciclaje (solo quedan 7)
  const allCodes = [...more.map(cardCode), ...afterMore.deck.map(cardCode), ...afterMore.discard.map(cardCode)];
  assert.equal(new Set(allCodes).size, 52);
  assert.equal(allCodes.length, 52);
});

test('drawCards(53) sigue fallando incluso después de reciclar (no hay 53 cartas)', () => {
  const shoe = createShoe();
  assert.throws(() => drawCards(shoe, 53));
});
