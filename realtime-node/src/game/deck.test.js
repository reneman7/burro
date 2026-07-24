import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, shuffle, cardCode, parseCard, rankValue, isHigherRank, SUITS, RANKS } from './deck.js';

test('createDeck tiene 52 cartas únicas, 4 palos x 13 rangos', () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);

  const codes = new Set(deck.map(cardCode));
  assert.equal(codes.size, 52);

  for (const suit of SUITS) {
    assert.equal(deck.filter((c) => c.suit === suit).length, 13);
  }
});

test('shuffle conserva exactamente las mismas 52 cartas, en otro orden', () => {
  const deck = createDeck();
  const shuffled = shuffle(deck);

  assert.equal(shuffled.length, 52);
  assert.deepEqual(
    [...shuffled.map(cardCode)].sort(),
    [...deck.map(cardCode)].sort()
  );

  // No debe mutar el arreglo original.
  assert.deepEqual(deck, createDeck());
});

test('cardCode / parseCard hacen roundtrip para todas las cartas', () => {
  for (const card of createDeck()) {
    const code = cardCode(card);
    assert.deepEqual(parseCard(code), card);
  }
});

test('rankValue: el 2 es el más bajo, el As es el más alto', () => {
  assert.equal(rankValue('2'), 0);
  assert.equal(rankValue('A'), RANKS.length - 1);
  assert.ok(rankValue('5') > rankValue('4'));
  assert.ok(rankValue('A') > rankValue('K'));
});

test('isHigherRank compara correctamente', () => {
  assert.equal(isHigherRank('5', '4'), true);
  assert.equal(isHigherRank('4', '5'), false);
  assert.equal(isHigherRank('A', 'K'), true);
});
