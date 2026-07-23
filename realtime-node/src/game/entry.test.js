import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEntrants } from './entry.js';

test('todos deciden libremente si el dealer no es el último forzado', () => {
  // Orden: B, C, D, A(dealer). Todos entran.
  const entrants = resolveEntrants(['B', 'C', 'D', 'A'], 'A', () => true);
  assert.deepEqual(entrants, ['B', 'C', 'D', 'A']);
});

test('el dealer NO está forzado si alguien más ya entró', () => {
  const decisions = { B: true, C: false, D: false };
  const entrants = resolveEntrants(['B', 'C', 'D', 'A'], 'A', (id) => {
    if (id === 'A') return false; // el dealer decide libremente no entrar
    return decisions[id];
  });
  assert.deepEqual(entrants, ['B']); // el dealer no fue forzado porque B ya había entrado
});

test('el dealer queda forzado a entrar si nadie más entró', () => {
  const entrants = resolveEntrants(['B', 'C', 'D', 'A'], 'A', () => false);
  assert.deepEqual(entrants, ['A']); // forzado, aunque decisionFn diría que no
});

test('con 1 solo entrante (el dealer forzado), la mano se gana automáticamente', () => {
  // Esto se valida en scoring.js, aquí solo confirmamos que resolveEntrants
  // deja exactamente 1 entrante en este escenario.
  const entrants = resolveEntrants(['B', 'C', 'A'], 'A', () => false);
  assert.deepEqual(entrants, ['A']);
});

test('decisionFn recibe los entrantes previos en orden, para decisiones informadas', () => {
  const seen = [];
  resolveEntrants(['B', 'C', 'D', 'A'], 'A', (id, entrantsSoFar) => {
    seen.push([id, [...entrantsSoFar]]);
    return id === 'B'; // solo B entra
  });

  // A no queda forzado (B ya había entrado), así que también pasa por decisionFn.
  assert.deepEqual(seen, [
    ['B', []],
    ['C', ['B']],
    ['D', ['B']],
    ['A', ['B']],
  ]);
});

test('el dealer decide libremente (no forzado) cuando ya hay entrantes, y puede decir que no', () => {
  const entrants = resolveEntrants(['B', 'C', 'A'], 'A', (id) => id === 'B');
  assert.deepEqual(entrants, ['B']); // A decidió que no, y no fue forzado porque B ya entró
});
