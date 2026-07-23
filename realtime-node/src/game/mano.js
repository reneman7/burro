import { dealMano, collectManoCards } from './dealing.js';
import { exchangeCards } from './exchange.js';
import { getValidPlays, resolveTrickWinner } from './trickRules.js';
import { resolveEntrants } from './entry.js';
import { computeManoPayments } from './scoring.js';
import { isHigherRank } from './deck.js';

/**
 * Simula una mano completa de principio a fin, delegando cada decisión de
 * jugador a callbacks (útil para pruebas automatizadas y para un futuro bot).
 * En la Fase 3, el servicio de tiempo real hará esto mismo paso a paso,
 * esperando eventos de socket reales (con timers de 30s) en vez de invocar
 * estos callbacks de forma síncrona.
 *
 * @param {object} params
 * @param {object} params.shoe
 * @param {Array<string|number>} params.seatOrderFromDealerRight
 * @param {string|number} params.dealerId
 * @param {boolean} params.isMandatory
 * @param {number} params.currentFondo
 * @param {number} params.maxExchange
 * @param {(userId, entrantsSoFar) => boolean} [params.decisionFn] - requerido si !isMandatory
 * @param {(userId, hand) => number[]} params.exchangeFn - índices a descartar
 * @param {(userId, hand, validIndexes, isAchico) => number} params.cardChoiceFn - índice a jugar
 * @returns {object} resultado completo de la mano
 */
export function playFullMano({
  shoe,
  seatOrderFromDealerRight,
  dealerId,
  isMandatory,
  currentFondo,
  maxExchange,
  decisionFn,
  exchangeFn,
  cardChoiceFn,
}) {
  // 1. Reparto: todos reciben 5 cartas (los no-entrantes se determinan después de verlas).
  const { hands: allHands, trumpCard, shoe: shoeAfterDeal } = dealMano(shoe, seatOrderFromDealerRight);
  let currentShoe = shoeAfterDeal;

  // 2. Decisión de entrar (solo manos optativas; en obligatorias todos entran).
  const entrants = isMandatory
    ? [...seatOrderFromDealerRight]
    : resolveEntrants(seatOrderFromDealerRight, dealerId, decisionFn);

  const nonEntrants = seatOrderFromDealerRight.filter((id) => !entrants.includes(id));
  for (const id of nonEntrants) {
    currentShoe = collectManoCards(currentShoe, allHands[id]);
  }

  // 3. Intercambio (solo entrantes, mismo orden que el reparto).
  const hands = {};
  for (const id of entrants) {
    const { hand, shoe: nextShoe } = exchangeCards(
      currentShoe,
      allHands[id],
      exchangeFn(id, allHands[id]),
      maxExchange
    );
    hands[id] = hand;
    currentShoe = nextShoe;
  }

  // 4. Bazas: 5 rondas, lidera la primera el de la derecha del dealer (primer
  // entrante en el orden de asiento), luego lidera quien ganó la anterior.
  const points = Object.fromEntries(entrants.map((id) => [id, 0]));
  const eliminated = new Set();
  const tricks = [];
  let leaderId = entrants[0];

  for (let trickNumber = 1; trickNumber <= 5; trickNumber++) {
    const activeOrderThisTrick = rotateFrom(entrants, leaderId).filter((id) => !eliminated.has(id));
    if (activeOrderThisTrick.length === 0) break; // todos eliminados, no debería pasar en la práctica

    const plays = [];
    const trickState = { ledSuit: null, trumpPlayed: false, highestTrumpRank: null };

    for (const userId of activeOrderThisTrick) {
      const hand = hands[userId];
      const { validIndexes, isAchico } = getValidPlays(hand, trickState, trumpCard.suit);
      const chosenIndex = cardChoiceFn(userId, hand, validIndexes, isAchico);

      if (!validIndexes.includes(chosenIndex)) {
        // Renuncia: el jugador tenía jugada válida y no la hizo. Pierde toda la mano.
        eliminated.add(userId);
        points[userId] = 0;
        hands[userId] = hand; // se le recogen las cartas restantes al cerrar la mano
        continue;
      }

      const card = hand[chosenIndex];
      hands[userId] = hand.filter((_, i) => i !== chosenIndex);
      plays.push({ userId, card, isAchico });

      if (trickState.ledSuit === null) {
        trickState.ledSuit = card.suit;
      }
      if (card.suit === trumpCard.suit) {
        trickState.trumpPlayed = true;
        if (trickState.highestTrumpRank === null || isHigherRank(card.rank, trickState.highestTrumpRank)) {
          trickState.highestTrumpRank = card.rank;
        }
      }
    }

    if (plays.length === 0) break; // todos renunciaron/eliminados en esta baza

    const winnerId = resolveTrickWinner(plays, plays[0].card.suit, trumpCard.suit);
    points[winnerId] += 1;
    tricks.push({ trickNumber, plays, winnerId, ledSuit: plays[0].card.suit });
    leaderId = winnerId;
  }

  // Renunciantes pierden todos sus puntos de esta mano, incluso si ya se habían salvado.
  for (const id of eliminated) points[id] = 0;

  // 5. Recoger todas las cartas: las efectivamente jugadas en las bazas, el
  // triunfo, y cualquier carta que haya quedado en mano de jugadores
  // eliminados (renuncia) al cerrarse la mano antes de que las jugaran todas.
  const playedCards = tricks.flatMap((t) => t.plays.map((p) => p.card));
  const leftoverCards = entrants.flatMap((id) => hands[id] ?? []);
  currentShoe = collectManoCards(currentShoe, [...playedCards, trumpCard, ...leftoverCards]);

  const payments = computeManoPayments(entrants, points, currentFondo);

  return {
    trumpCard,
    entrants,
    nonEntrants,
    eliminated: [...eliminated],
    points,
    tricks,
    payments,
    shoe: currentShoe,
  };
}

export function rotateFrom(order, startId) {
  const i = order.indexOf(startId);
  return [...order.slice(i), ...order.slice(0, i)];
}
