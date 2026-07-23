import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getValidPlays, resolveTrickWinner } from './trickRules.js';

const TRUMP = 'corazones';
const c = (rank, suit) => ({ rank, suit });

test('liderando la baza, cualquier carta es válida', () => {
  const hand = [c('4', 'treboles'), c('K', TRUMP)];
  const { validIndexes, isAchico } = getValidPlays(hand, { ledSuit: null, trumpPlayed: false, highestTrumpRank: null }, TRUMP);
  assert.deepEqual(validIndexes, [0, 1]);
  assert.equal(isAchico, false);
});

test('pre-triunfo: con el palo pedido en mano, SOLO ese palo es válido (no puede triunfar teniendo el palo)', () => {
  const hand = [c('2', 'treboles'), c('A', TRUMP), c('9', 'treboles')];
  const { validIndexes, isAchico } = getValidPlays(
    hand,
    { ledSuit: 'treboles', trumpPlayed: false, highestTrumpRank: null },
    TRUMP
  );
  assert.deepEqual(validIndexes, [0, 2]);
  assert.equal(isAchico, false);
});

test('pre-triunfo: sin el palo pedido pero con triunfo, DEBE triunfar (cualquiera de sus triunfos)', () => {
  const hand = [c('2', 'espadas'), c('A', TRUMP), c('9', TRUMP)];
  const { validIndexes, isAchico } = getValidPlays(
    hand,
    { ledSuit: 'treboles', trumpPlayed: false, highestTrumpRank: null },
    TRUMP
  );
  assert.deepEqual(validIndexes, [1, 2]);
  assert.equal(isAchico, false);
});

test('pre-triunfo: sin el palo pedido ni triunfo, cualquier carta es libre (no es "me achico")', () => {
  const hand = [c('2', 'espadas'), c('9', 'diamantes')];
  const { validIndexes, isAchico } = getValidPlays(
    hand,
    { ledSuit: 'treboles', trumpPlayed: false, highestTrumpRank: null },
    TRUMP
  );
  assert.deepEqual(validIndexes, [0, 1]);
  assert.equal(isAchico, false);
});

test('post-triunfo: con el palo pedido, puede elegir entre el palo pedido O un triunfo mayor', () => {
  const hand = [c('2', 'treboles'), c('Q', TRUMP), c('4', TRUMP)];
  const { validIndexes, isAchico } = getValidPlays(
    hand,
    { ledSuit: 'treboles', trumpPlayed: true, highestTrumpRank: '9' },
    TRUMP
  );
  // El 2 de tréboles (palo pedido) y la Q de corazones (triunfo mayor a 9) son válidos;
  // el 4 de corazones (triunfo, pero NO mayor a 9) no lo es.
  assert.deepEqual(validIndexes.sort(), [0, 1]);
  assert.equal(isAchico, false);
});

test('post-triunfo: sin el palo pedido, solo triunfos que superen al más alto jugado', () => {
  const hand = [c('K', TRUMP), c('4', TRUMP), c('9', 'diamantes')];
  const { validIndexes, isAchico } = getValidPlays(
    hand,
    { ledSuit: 'treboles', trumpPlayed: true, highestTrumpRank: '7' },
    TRUMP
  );
  assert.deepEqual(validIndexes, [0]); // solo el K de corazones supera al 7
  assert.equal(isAchico, false);
});

test('post-triunfo: sin palo pedido y sin triunfo que supere -> "me achico" (cualquier carta)', () => {
  const hand = [c('4', TRUMP), c('9', 'diamantes'), c('2', 'espadas')];
  const { validIndexes, isAchico } = getValidPlays(
    hand,
    { ledSuit: 'treboles', trumpPlayed: true, highestTrumpRank: 'K' },
    TRUMP
  );
  assert.deepEqual(validIndexes, [0, 1, 2]);
  assert.equal(isAchico, true);
});

test('post-triunfo: teniendo el palo pedido, jugar otra cosa fuera del conjunto válido sería renuncia (no está en validIndexes)', () => {
  const hand = [c('2', 'treboles'), c('9', 'diamantes')];
  const { validIndexes } = getValidPlays(
    hand,
    { ledSuit: 'treboles', trumpPlayed: true, highestTrumpRank: 'K' },
    TRUMP
  );
  // Tiene el palo pedido (índice 0), así que ESE es válido; el 9 de diamantes (índice 1) no lo es.
  assert.deepEqual(validIndexes, [0]);
  assert.ok(!validIndexes.includes(1));
});

test('resolveTrickWinner: sin triunfos jugados, gana la carta más alta del palo pedido', () => {
  const plays = [
    { userId: 'A', card: c('4', 'treboles') },
    { userId: 'B', card: c('9', 'treboles') },
    { userId: 'C', card: c('2', 'diamantes') }, // descarte libre, no cuenta
  ];
  assert.equal(resolveTrickWinner(plays, 'treboles', TRUMP), 'B');
});

test('resolveTrickWinner: el triunfo más alto gana, sin importar el palo pedido', () => {
  const plays = [
    { userId: 'A', card: c('K', 'treboles') },
    { userId: 'B', card: c('2', TRUMP) },
    { userId: 'C', card: c('5', TRUMP) },
  ];
  assert.equal(resolveTrickWinner(plays, 'treboles', TRUMP), 'C');
});

test('resolveTrickWinner: si el líder abre con triunfo, ese palo es el pedido y compite normalmente', () => {
  const plays = [
    { userId: 'A', card: c('4', TRUMP) },
    { userId: 'B', card: c('9', TRUMP) },
    { userId: 'C', card: c('2', 'diamantes') },
  ];
  assert.equal(resolveTrickWinner(plays, TRUMP, TRUMP), 'B');
});
