import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeManoPayments } from './scoring.js';

test('caso normal: 2 se salvan, 2 no, pagan el fondo actual y se reparte en partes iguales', () => {
  const entrants = ['A', 'B', 'C', 'D'];
  const points = { A: 2, B: 2, C: 1, D: 0 };
  const result = computeManoPayments(entrants, points, 4);

  assert.deepEqual(result.saved.sort(), ['A', 'B']);
  assert.deepEqual(result.notSaved.sort(), ['C', 'D']);
  assert.equal(result.paymentPerLoser, 4);
  assert.equal(result.totalCollected, 8);
  assert.equal(result.payoutPerWinner, 4);
  assert.equal(result.payouts.A, 4);
  assert.equal(result.payouts.B, 4);
  assert.equal(result.newFondo, 4, 'el fondo acumulado no se toca con el pago de la mano');
  assert.equal(result.partidaEnds, false);
});

test('excepción: 5 entrantes con 1 punto cada uno -> nadie se salva, el pago se queda en el fondo', () => {
  const entrants = ['A', 'B', 'C', 'D', 'E'];
  const points = { A: 1, B: 1, C: 1, D: 1, E: 1 };
  const result = computeManoPayments(entrants, points, 10);

  assert.deepEqual(result.saved, []);
  assert.equal(result.notSaved.length, 5);
  assert.equal(result.paymentPerLoser, 10);
  assert.equal(result.totalCollected, 50);
  assert.deepEqual(result.payouts, {});
  assert.equal(result.newFondo, 60, 'el fondo crece con lo pagado porque no hay a quién repartírselo');
  assert.equal(result.partidaEnds, false);
});

test('todos los entrantes se salvan -> termina la partida, nadie paga', () => {
  const entrants = ['A', 'B'];
  const points = { A: 3, B: 2 };
  const result = computeManoPayments(entrants, points, 12);

  assert.deepEqual(result.saved.sort(), ['A', 'B']);
  assert.deepEqual(result.notSaved, []);
  assert.equal(result.totalCollected, 0);
  assert.equal(result.newFondo, 12);
  assert.equal(result.partidaEnds, true);
});

test('1 solo entrante (dealer forzado) se salva automáticamente y termina la partida', () => {
  const result = computeManoPayments(['A'], { A: 5 }, 20);
  assert.deepEqual(result.saved, ['A']);
  assert.equal(result.partidaEnds, true);
  assert.equal(result.totalCollected, 0);
});

test('residuo de redondeo se queda en el fondo cuando el pago no se divide exacto', () => {
  // 1 perdedor paga el fondo (7), repartido entre 3 salvados: 7/3 = 2 c/u, sobra 1.
  const result = computeManoPayments(['A', 'B', 'C', 'D'], { A: 2, B: 2, C: 2, D: 1 }, 7);
  assert.equal(result.totalCollected, 7);
  assert.equal(result.payoutPerWinner, 2);
  assert.equal(result.payouts.A, 2);
  assert.equal(result.payouts.B, 2);
  assert.equal(result.payouts.C, 2);
  assert.equal(result.newFondo, 7 + 1, 'el residuo (1) se suma al fondo en vez de perderse');
});

test('conservación de fichas: lo que pagan los perdedores siempre es igual a payouts + residuo agregado al fondo', () => {
  const result = computeManoPayments(['A', 'B', 'C'], { A: 2, B: 0, C: 0 }, 5);
  const totalPaidOut = Object.values(result.payouts).reduce((a, b) => a + b, 0);
  const fondoGrowth = result.newFondo - 5;
  assert.equal(totalPaidOut + fondoGrowth, result.totalCollected);
});
