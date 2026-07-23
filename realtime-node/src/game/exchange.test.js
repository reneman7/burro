import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShoe } from './shoe.js';
import { exchangeCards } from './exchange.js';

function sampleHand() {
  return [
    { rank: '2', suit: 'diamantes' },
    { rank: '3', suit: 'diamantes' },
    { rank: '4', suit: 'diamantes' },
    { rank: '5', suit: 'diamantes' },
    { rank: '6', suit: 'diamantes' },
  ];
}

test('exchangeCards con 0 índices no cambia nada', () => {
  const shoe = createShoe();
  const hand = sampleHand();
  const { hand: newHand, shoe: newShoe } = exchangeCards(shoe, hand, [], 5);

  assert.deepEqual(newHand, hand);
  assert.equal(newShoe.deck.length, shoe.deck.length);
});

test('exchangeCards reemplaza exactamente las cartas descartadas', () => {
  const shoe = createShoe();
  const hand = sampleHand();
  const { hand: newHand, shoe: newShoe } = exchangeCards(shoe, hand, [0, 2], 5);

  assert.equal(newHand.length, 5);
  // Las 3 cartas no tocadas siguen presentes.
  assert.ok(newHand.some((c) => c.rank === '3' && c.suit === 'diamantes'));
  assert.ok(newHand.some((c) => c.rank === '5' && c.suit === 'diamantes'));
  assert.ok(newHand.some((c) => c.rank === '6' && c.suit === 'diamantes'));

  assert.equal(newShoe.discard.length, 2);
  assert.equal(newShoe.deck.length, shoe.deck.length - 2);
});

test('exchangeCards respeta un máximo configurado menor a 5', () => {
  const shoe = createShoe();
  const hand = sampleHand();
  assert.throws(() => exchangeCards(shoe, hand, [0, 1, 2], 2));
});

test('exchangeCards permite cambiar las 5 cartas cuando el máximo lo permite', () => {
  const shoe = createShoe();
  const hand = sampleHand();
  const { hand: newHand, shoe: newShoe } = exchangeCards(shoe, hand, [0, 1, 2, 3, 4], 5);

  assert.equal(newHand.length, 5);
  assert.equal(newShoe.discard.length, 5);
  assert.deepEqual(
    [...newShoe.discard.map((c) => `${c.rank}${c.suit}`)].sort(),
    [...hand.map((c) => `${c.rank}${c.suit}`)].sort()
  );
});

test('exchangeCards rechaza índices fuera de rango', () => {
  const shoe = createShoe();
  const hand = sampleHand();
  assert.throws(() => exchangeCards(shoe, hand, [10], 5));
});
