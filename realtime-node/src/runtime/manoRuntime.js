import { EventEmitter } from 'node:events';
import { dealMano, collectManoCards } from '../game/dealing.js';
import { exchangeCards } from '../game/exchange.js';
import { getValidPlays, resolveTrickWinner } from '../game/trickRules.js';
import { computeManoPayments } from '../game/scoring.js';
import { isHigherRank } from '../game/deck.js';
import { rotateFrom } from '../game/mano.js';

const DEFAULT_TURN_TIMEOUT_MS = 30_000;

/**
 * Contraparte "interactiva" de game/mano.js: en vez de simular una mano
 * completa de forma síncrona con callbacks, esta clase avanza paso a paso
 * en respuesta a eventos reales (jugadas de socket) o a un timer por turno
 * (configurable desde el panel de admin, turn_timeout_seconds), emitiendo
 * eventos para que la capa de sockets transmita el estado y persista
 * resultados. La validez de cada jugada se apoya en las mismas funciones
 * puras de game/trickRules.js, game/exchange.js, etc.
 */
export class ManoRuntime extends EventEmitter {
  constructor({ shoe, seatOrderFromDealerRight, dealerId, isMandatory, currentFondo, maxExchange, turnTimeoutMs }) {
    super();
    this.seatOrderFromDealerRight = seatOrderFromDealerRight;
    this.dealerId = dealerId;
    this.isMandatory = isMandatory;
    this.currentFondo = currentFondo;
    this.maxExchange = maxExchange;
    this.turnTimeoutMs = turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS;

    const { hands, trumpCard, shoe: shoeAfterDeal } = dealMano(shoe, seatOrderFromDealerRight);
    this.allHands = hands;
    this.trumpCard = trumpCard;
    this.shoe = shoeAfterDeal;

    this.entrants = [];
    this.nonEntrants = [];
    this.hands = {};
    this.exchangedCounts = {};
    this.points = {};
    this.eliminated = new Set();
    this.tricks = [];
    this.currentTrickPlays = [];
    this.trickState = null;
    this.currentTrickNumber = 0;
    this.leaderId = null;

    this.phase = 'entry';
    this.turnQueue = [];
    this.turnIndex = -1;
    this.timer = null;
    this.turnDeadline = null;
  }

  get currentTurnUserId() {
    return this.turnQueue[this.turnIndex] ?? null;
  }

  start() {
    if (this.isMandatory) {
      this.entrants = [...this.seatOrderFromDealerRight];
      this._beginExchangePhase();
    } else {
      this._beginEntryPhase();
    }
  }

  // ------------------------------------------------------------------
  // Fase de entrada (solo manos optativas)
  // ------------------------------------------------------------------

  _beginEntryPhase() {
    this.phase = 'entry';
    this.turnQueue = [...this.seatOrderFromDealerRight];
    this.turnIndex = 0;
    this._armTimer(() => this._onEntryTimeout());
    this.emit('stateChanged');
  }

  decideEntry(userId, entered) {
    if (this.phase !== 'entry') throw new Error('No es momento de decidir si entrar');
    if (userId !== this.currentTurnUserId) throw new Error('No es tu turno');
    this._clearTimer();
    this._resolveCurrentEntryTurn(Boolean(entered));
  }

  _onEntryTimeout() {
    this._resolveCurrentEntryTurn(false);
  }

  _resolveCurrentEntryTurn(chosenEntered) {
    const userId = this.currentTurnUserId;
    const isDealer = userId === this.dealerId;
    const forced = isDealer && this.entrants.length === 0;
    const finalDecision = forced || chosenEntered;

    // this.nonEntrants se llena aquí mismo (no solo al final de la fase) para
    // que quien esté viendo la mesa vea "no entró" apenas cada quien decide,
    // en vez de recién cuando termina toda la ronda de decisiones.
    if (finalDecision) this.entrants.push(userId);
    else this.nonEntrants.push(userId);
    this.emit('entryDecided', { userId, entered: finalDecision, forced });
    this._advanceEntryTurn();
  }

  _advanceEntryTurn() {
    this.turnIndex += 1;
    if (this.turnIndex >= this.turnQueue.length) {
      for (const id of this.nonEntrants) {
        this.shoe = collectManoCards(this.shoe, this.allHands[id]);
      }
      if (this.entrants.length === 1) {
        // Con un solo entrante no hay nadie contra quién competir: ni el
        // intercambio ni las bazas cambian un resultado ya decidido, así que
        // se salta directo a ganar la mano en vez de hacerlo jugar de todas
        // formas.
        this._winAsSoleEntrant();
        return;
      }
      this._beginExchangePhase();
    } else {
      this._armTimer(() => this._onEntryTimeout());
      this.emit('stateChanged');
    }
  }

  /** Se salva automático (5 de 5), sin pasar por intercambio ni bazas. */
  _winAsSoleEntrant() {
    const soleEntrantId = this.entrants[0];
    this.hands[soleEntrantId] = this.allHands[soleEntrantId];
    this.phase = 'playing';
    this.points = { [soleEntrantId]: 5 };
    this._finishMano();
  }

  // ------------------------------------------------------------------
  // Fase de intercambio (solo entrantes)
  // ------------------------------------------------------------------

  _beginExchangePhase() {
    this.phase = 'exchange';
    for (const id of this.entrants) this.hands[id] = this.allHands[id];
    this.turnQueue = [...this.entrants];
    this.turnIndex = 0;
    this._armTimer(() => this._onExchangeTimeout());
    this.emit('stateChanged');
  }

  exchange(userId, discardIndexes) {
    if (this.phase !== 'exchange') throw new Error('No es momento de intercambiar cartas');
    if (userId !== this.currentTurnUserId) throw new Error('No es tu turno');
    this._clearTimer();
    this._resolveCurrentExchange(discardIndexes);
  }

  _onExchangeTimeout() {
    this._resolveCurrentExchange([]);
  }

  _resolveCurrentExchange(discardIndexes) {
    const userId = this.currentTurnUserId;
    const { hand, shoe } = exchangeCards(this.shoe, this.hands[userId], discardIndexes, this.maxExchange);
    this.hands[userId] = hand;
    this.shoe = shoe;
    this.exchangedCounts[userId] = discardIndexes.length;
    this.emit('handUpdated', { userId, hand });
    this._advanceExchangeTurn();
  }

  _advanceExchangeTurn() {
    this.turnIndex += 1;
    if (this.turnIndex >= this.turnQueue.length) {
      this._beginPlayPhase();
    } else {
      this._armTimer(() => this._onExchangeTimeout());
      this.emit('stateChanged');
    }
  }

  // ------------------------------------------------------------------
  // Fase de bazas
  // ------------------------------------------------------------------

  _beginPlayPhase() {
    this.phase = 'playing';
    this.points = Object.fromEntries(this.entrants.map((id) => [id, 0]));
    this.leaderId = this.entrants[0];
    for (const id of this.entrants) this.emit('handUpdated', { userId: id, hand: this.hands[id] });

    if (this.entrants.length === 1) {
      // Con un solo entrante no hay contra quién competir cada baza: se
      // salva automático (5 de 5) sin obligarlo a tirar sus cartas una por
      // una para un resultado que ya está decidido.
      this.points[this.entrants[0]] = 5;
      this._finishMano();
      return;
    }

    this._beginTrick();
  }

  _beginTrick() {
    this.currentTrickNumber += 1;
    if (this.currentTrickNumber > 5) {
      this._finishMano();
      return;
    }

    const activeOrder = rotateFrom(this.entrants, this.leaderId).filter((id) => !this.eliminated.has(id));
    if (activeOrder.length === 0) {
      this._finishMano();
      return;
    }

    this.currentTrickPlays = [];
    this.trickState = { ledSuit: null, trumpPlayed: false, highestTrumpRank: null };
    this.turnQueue = activeOrder;
    this.turnIndex = 0;
    this._armTimer(() => this._onPlayTimeout());
    this.emit('stateChanged');
  }

  /** Jugadas válidas para el jugador a quien le toca ahora mismo (o null si no es fase de bazas). */
  getCurrentValidPlays() {
    if (this.phase !== 'playing') return null;
    const userId = this.currentTurnUserId;
    if (!userId) return null;
    return getValidPlays(this.hands[userId], this.trickState, this.trumpCard.suit);
  }

  playCard(userId, cardIndex) {
    if (this.phase !== 'playing') throw new Error('No es momento de jugar carta');
    if (userId !== this.currentTurnUserId) throw new Error('No es tu turno');
    const { validIndexes, isAchico } = this.getCurrentValidPlays();
    this._clearTimer();
    this._resolvePlay(userId, cardIndex, validIndexes, isAchico);
  }

  _onPlayTimeout() {
    // 30s sin actuar en tu turno de jugar carta = renuncia automática.
    this._eliminate(this.currentTurnUserId);
    this._advancePlayTurn();
  }

  _resolvePlay(userId, cardIndex, validIndexes, isAchico) {
    const hand = this.hands[userId];
    if (!validIndexes.includes(cardIndex)) {
      this._eliminate(userId);
      this._advancePlayTurn();
      return;
    }

    const card = hand[cardIndex];
    this.hands[userId] = hand.filter((_, i) => i !== cardIndex);
    this.currentTrickPlays.push({ userId, card, isAchico });
    this.emit('cardPlayed', { userId, card, isAchico });
    // Sin esto, la carta jugada nunca desaparecía de la mano del jugador en
    // su propia pantalla (el estado interno sí se actualizaba, pero nadie
    // avisaba al cliente).
    this.emit('handUpdated', { userId, hand: this.hands[userId] });

    if (this.trickState.ledSuit === null) this.trickState.ledSuit = card.suit;
    if (card.suit === this.trumpCard.suit) {
      this.trickState.trumpPlayed = true;
      if (this.trickState.highestTrumpRank === null || isHigherRank(card.rank, this.trickState.highestTrumpRank)) {
        this.trickState.highestTrumpRank = card.rank;
      }
    }

    this._advancePlayTurn();
  }

  _eliminate(userId) {
    this.eliminated.add(userId);
    this.points[userId] = 0;
    this.emit('renounced', { userId });
  }

  _advancePlayTurn() {
    this.turnIndex += 1;
    if (this.turnIndex >= this.turnQueue.length) {
      this._finishTrick();
    } else {
      this._armTimer(() => this._onPlayTimeout());
      this.emit('stateChanged');
    }
  }

  _finishTrick() {
    if (this.currentTrickPlays.length === 0) {
      this._beginTrick();
      return;
    }

    const winnerId = resolveTrickWinner(this.currentTrickPlays, this.currentTrickPlays[0].card.suit, this.trumpCard.suit);
    this.points[winnerId] += 1;
    const trick = {
      trickNumber: this.currentTrickNumber,
      plays: this.currentTrickPlays,
      winnerId,
      ledSuit: this.currentTrickPlays[0].card.suit,
    };
    this.tricks.push(trick);
    this.leaderId = winnerId;
    this.emit('trickFinished', trick);
    this._beginTrick();
  }

  _finishMano() {
    this.phase = 'finished';
    this._clearTimer();
    for (const id of this.eliminated) this.points[id] = 0;

    const playedCards = this.tricks.flatMap((t) => t.plays.map((p) => p.card));
    const leftoverCards = this.entrants.flatMap((id) => this.hands[id] ?? []);
    this.shoe = collectManoCards(this.shoe, [...playedCards, this.trumpCard, ...leftoverCards]);

    const payments = computeManoPayments(this.entrants, this.points, this.currentFondo);

    this.emit('manoFinished', {
      trumpCard: this.trumpCard,
      entrants: this.entrants,
      nonEntrants: this.nonEntrants,
      eliminated: [...this.eliminated],
      exchangedCounts: this.exchangedCounts,
      points: this.points,
      tricks: this.tricks,
      payments,
      shoe: this.shoe,
    });
  }

  /** Estado público (sin manos de nadie) para difundir por socket. */
  getPublicState() {
    return {
      phase: this.phase,
      dealerId: this.dealerId,
      isMandatory: this.isMandatory,
      maxExchange: this.maxExchange,
      trumpCard: this.trumpCard,
      seatOrder: this.seatOrderFromDealerRight,
      entrants: this.entrants,
      nonEntrants: this.nonEntrants,
      exchangedCounts: this.exchangedCounts,
      turnUserId: this.currentTurnUserId,
      turnDeadline: this.turnDeadline,
      currentTrick:
        this.phase === 'playing'
          ? { trickNumber: this.currentTrickNumber, ledSuit: this.trickState?.ledSuit ?? null, plays: this.currentTrickPlays }
          : null,
      points: this.points,
      eliminated: [...this.eliminated],
    };
  }

  _armTimer(fn) {
    this._clearTimer();
    this.turnDeadline = Date.now() + this.turnTimeoutMs;
    this.timer = setTimeout(fn, this.turnTimeoutMs);
  }

  _clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.turnDeadline = null;
  }

  destroy() {
    this._clearTimer();
    this.removeAllListeners();
  }
}
