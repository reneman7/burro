import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from './deck.js';
import { playFullMano } from './mano.js';

const c = (rank, suit) => ({ rank, suit });

function buildRiggedShoe(orderedTopCards) {
  const deck = createDeck();
  const isPicked = (card) => orderedTopCards.some((p) => p.rank === card.rank && p.suit === card.suit);
  const rest = deck.filter((card) => !isPicked(card));
  return { deck: [...orderedTopCards, ...rest], discard: [] };
}

function queueChoiceFn(plan) {
  const queues = Object.fromEntries(Object.entries(plan).map(([id, cards]) => [id, [...cards]]));
  return (userId, hand) => {
    const next = queues[userId].shift();
    const idx = hand.findIndex((card) => card.rank === next.rank && card.suit === next.suit);
    if (idx === -1) {
      throw new Error(`Test mal diseñado: ${userId} no tiene ${next.rank}${next.suit} en su mano actual`);
    }
    return idx;
  };
}

test('mano completa de 3 jugadores, resultado determinístico verificado carta por carta', () => {
  // Trump = corazones. Diseñado a mano para forzar: triunfo obligatorio pre-triunfo,
  // "me achico" ausente (nadie cae en ese caso aquí, se prueba aparte), seguir-palo,
  // y que A gane 2 bazas, B gane 2, C gane 1 (5 puntos repartidos en total).
  const B_HAND = [c('4', 'treboles'), c('7', 'diamantes'), c('2', 'espadas'), c('6', 'treboles'), c('9', 'diamantes')];
  const C_HAND = [c('9', 'treboles'), c('8', 'diamantes'), c('3', 'corazones'), c('5', 'treboles'), c('A', 'diamantes')];
  const A_HAND = [c('2', 'corazones'), c('K', 'diamantes'), c('7', 'espadas'), c('6', 'diamantes'), c('3', 'espadas')];
  const TRUMP_CARD = c('5', 'corazones');

  const shoe = buildRiggedShoe([...B_HAND, ...C_HAND, ...A_HAND, TRUMP_CARD]);

  const plan = {
    B: [c('4', 'treboles'), c('9', 'diamantes'), c('2', 'espadas'), c('6', 'treboles'), c('7', 'diamantes')],
    C: [c('9', 'treboles'), c('8', 'diamantes'), c('3', 'corazones'), c('5', 'treboles'), c('A', 'diamantes')],
    A: [c('2', 'corazones'), c('K', 'diamantes'), c('7', 'espadas'), c('6', 'diamantes'), c('3', 'espadas')],
  };

  const result = playFullMano({
    shoe,
    seatOrderFromDealerRight: ['B', 'C', 'A'],
    dealerId: 'A',
    isMandatory: true,
    currentFondo: 10,
    maxExchange: 5,
    exchangeFn: () => [],
    cardChoiceFn: queueChoiceFn(plan),
  });

  assert.deepEqual(result.trumpCard, c('5', 'corazones'));
  assert.equal(result.tricks.length, 5);
  assert.deepEqual(result.eliminated, []);

  // Baza 1: B lidera 4♣, C sigue con 9♣, A no tiene tréboles y debe triunfar (2♥) -> gana A.
  assert.equal(result.tricks[0].winnerId, 'A');
  // Baza 2: A lidera K♦, B sigue 9♦, C sigue 8♦ (nadie triunfa) -> gana A (K es la más alta).
  assert.equal(result.tricks[1].winnerId, 'A');
  // Baza 3: A lidera 7♠, B sigue 2♠, C no tiene espadas y debe triunfar (3♥) -> gana C.
  assert.equal(result.tricks[2].winnerId, 'C');
  // Baza 4: C lidera 5♣, A no tiene tréboles ni triunfo (libre, 6♦), B sigue 6♣ -> gana B (6 > 5).
  assert.equal(result.tricks[3].winnerId, 'B');
  // Baza 5: B lidera 7♦, C sigue A♦ (el As es la carta MÁS ALTA) -> gana C (A > 7).
  assert.equal(result.tricks[4].winnerId, 'C');

  assert.deepEqual(result.points, { B: 1, C: 2, A: 2 });

  // A y C se salvan (2 pts c/u), B no (1 pt). Paga el fondo actual (10), se
  // reparte 5/5 entre A y C; el fondo acumulado no se toca.
  assert.deepEqual(result.payments.saved.sort(), ['A', 'C']);
  assert.deepEqual(result.payments.notSaved, ['B']);
  assert.equal(result.payments.paymentPerLoser, 10);
  assert.equal(result.payments.payoutPerWinner, 5);
  assert.equal(result.payments.newFondo, 10);
  assert.equal(result.payments.partidaEnds, false);

  // Las 16 cartas usadas (15 de manos + 1 triunfo) deben terminar en el descarte.
  assert.equal(result.shoe.discard.length, 16);
  const allCodes = [...result.shoe.deck, ...result.shoe.discard].map((c) => `${c.rank}${c.suit}`);
  assert.equal(new Set(allCodes).size, 52, 'las 52 cartas deben seguir existiendo, sin duplicados');
});

test('renuncia: jugador con jugada válida que intenta bajar otra carta queda eliminado y pierde sus puntos', () => {
  // Mismo montaje que la prueba anterior. En la baza 1, B lidera con 4♣; C SÍ
  // tiene tréboles en mano (9♣, 5♣) por lo que está obligado a seguir el
  // palo, pero en vez de eso intenta bajar 8♦ (fuera del conjunto válido) ->
  // renuncia. La baza y la mano deben continuar sin C.
  const B_HAND = [c('4', 'treboles'), c('7', 'diamantes'), c('2', 'espadas'), c('6', 'treboles'), c('9', 'diamantes')];
  const C_HAND = [c('9', 'treboles'), c('8', 'diamantes'), c('3', 'corazones'), c('5', 'treboles'), c('A', 'diamantes')];
  const A_HAND = [c('2', 'corazones'), c('K', 'diamantes'), c('7', 'espadas'), c('6', 'diamantes'), c('3', 'espadas')];
  const TRUMP_CARD = c('5', 'corazones');
  const shoe = buildRiggedShoe([...B_HAND, ...C_HAND, ...A_HAND, TRUMP_CARD]);

  // Para B y A, una vez que C renuncia, la trayectoria de la mano cambia por
  // completo (quién lidera cada baza deja de coincidir con la prueba
  // anterior), así que en vez de un guion rígido usamos un "bot" simple que
  // siempre juega su primera opción válida — esto nunca genera una renuncia
  // accidental y nos deja verificar solo lo que de verdad importa aquí: que
  // la renuncia de C se detecta y que la mano sigue sin él hasta el final.
  let cTurnCount = 0;
  const cardChoiceFn = (userId, hand, validIndexes) => {
    if (userId === 'C') {
      cTurnCount += 1;
      if (cTurnCount === 1) {
        // Tiene 9♣ y 5♣ válidos (índices en validIndexes), pero intenta 8♦.
        const invalidIdx = hand.findIndex((card, i) => !validIndexes.includes(i) && card.suit === 'diamantes');
        assert.ok(invalidIdx !== -1, 'la prueba requiere que C tenga un diamante disponible para intentar la renuncia');
        return invalidIdx;
      }
      throw new Error('C debería haber quedado eliminado y no volver a ser llamado');
    }
    return validIndexes[0];
  };

  const result = playFullMano({
    shoe,
    seatOrderFromDealerRight: ['B', 'C', 'A'],
    dealerId: 'A',
    isMandatory: true,
    currentFondo: 10,
    maxExchange: 5,
    exchangeFn: () => [],
    cardChoiceFn,
  });

  assert.deepEqual(result.eliminated, ['C']);
  assert.equal(result.points.C, 0, 'quien renuncia pierde todos sus puntos de la mano');
  assert.equal(result.tricks.length, 5, 'la mano sigue jugándose hasta el final entre los jugadores restantes');
  // Baza 1: B lidera 4♣, C renuncia (queda fuera), A no tiene tréboles y
  // debe triunfar con 2♥ -> gana A, sin que C haya aportado jugada válida.
  assert.equal(result.tricks[0].winnerId, 'A');
  assert.equal(result.tricks[0].plays.length, 2, 'la jugada inválida de C no cuenta como jugada en la baza');

  const totalPoints = Object.values(result.points).reduce((a, b) => a + b, 0);
  assert.equal(totalPoints, 5, 'las 5 bazas siguen repartiendo 5 puntos en total, aunque C esté eliminado');

  const allCodes = [...result.shoe.deck, ...result.shoe.discard].map((c) => `${c.rank}${c.suit}`);
  assert.equal(new Set(allCodes).size, 52);
});

test('mano optativa: si todos declinan, el dealer queda forzado, entra solo, y se salva/termina la partida automáticamente', () => {
  const shoe = { deck: createDeck(), discard: [] };

  const result = playFullMano({
    shoe,
    seatOrderFromDealerRight: ['B', 'C', 'A'],
    dealerId: 'A',
    isMandatory: false,
    currentFondo: 20,
    maxExchange: 5,
    decisionFn: () => false, // B y C declinan; A será forzado por ser el único que queda
    exchangeFn: () => [],
    cardChoiceFn: () => 0, // única opción real: siempre hay una sola carta jugable
  });

  assert.deepEqual(result.entrants, ['A']);
  assert.deepEqual(result.nonEntrants.sort(), ['B', 'C']);
  assert.equal(result.points.A, 5, 'con un solo entrante, gana las 5 bazas automáticamente');
  assert.equal(result.payments.saved.length, 1);
  assert.equal(result.payments.partidaEnds, true);
  assert.equal(result.payments.totalCollected, 0, 'no hay perdedores entre los entrantes, nadie paga');

  // Las cartas de B y C (que no entraron) deben haberse recogido igual, y las 52 siguen intactas.
  const allCodes = [...result.shoe.deck, ...result.shoe.discard].map((c) => `${c.rank}${c.suit}`);
  assert.equal(new Set(allCodes).size, 52);
});
