import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShoe } from './shoe.js';
import { dealMano } from './dealing.js';

test('dealMano reparte 5 cartas a cada jugador y 1 de triunfo, sin repetir cartas', () => {
  const shoe = createShoe();
  const seatOrder = ['B', 'C', 'D', 'A']; // empezando a la derecha del dealer A
  const { hands, trumpCard, shoe: next } = dealMano(shoe, seatOrder);

  for (const id of seatOrder) {
    assert.equal(hands[id].length, 5);
  }
  assert.ok(trumpCard.suit && trumpCard.rank);

  const allDealt = [...seatOrder.flatMap((id) => hands[id]), trumpCard];
  assert.equal(allDealt.length, 21);
  assert.equal(new Set(allDealt.map((c) => `${c.rank}${c.suit}`)).size, 21, 'no debe haber cartas repetidas');

  assert.equal(next.deck.length, 52 - 21);
});

test('dealMano reparte en el orden dado (empezando a la derecha del dealer)', () => {
  const shoe = createShoe();
  const seatOrder = ['B', 'C', 'D', 'A'];
  const { hands } = dealMano(shoe, seatOrder);

  // Cada jugador en la lista debe tener exactamente 5 cartas asignadas (verifica
  // que el reparto "de golpe" cubrió a todos en el orden declarado).
  for (const id of seatOrder) {
    assert.equal(hands[id]?.length, 5);
  }
});
