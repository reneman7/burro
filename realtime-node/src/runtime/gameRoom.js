import { createShoe } from '../game/shoe.js';
import { ManoRuntime } from './manoRuntime.js';
import {
  getSeatOrder,
  getActivePartida,
  determineNextDealer,
  countManosInPartida,
  createManoRow,
  finalizeManoRow,
  insertManoPlayers,
  insertTricks,
  applyManoPayments,
  chargeAnte,
  getTableBalances,
  finalizePartida,
  getAdminSetting,
} from '../db/queries.js';
import { roomName as lobbyRoomName, loadTableState } from '../sockets/lobby.js';

const NEXT_MANO_DELAY_MS = 5000;
const MANO_RESULT_BROADCAST_DELAY_MS = 0;

/**
 * Coordina la partida en curso de UNA mesa: carga el estado de la DB, arranca
 * cada mano (cobrando la apuesta, repartiendo, corriendo el ManoRuntime),
 * persiste resultados al terminar, y decide si continúa con otra mano o si
 * la partida ya terminó (reparte el fondo y deja la mesa en 'waiting').
 *
 * También lleva el registro de qué socket pertenece a qué usuario dentro de
 * esta mesa, para poder enviar la mano privada de cada jugador y permitir
 * reconexión (un socket nuevo del mismo usuario simplemente se re-registra
 * y recibe el estado actual).
 */
export class GameRoom {
  constructor(io, tableId) {
    this.io = io;
    this.tableId = tableId;
    this.sockets = new Map(); // userId -> socket
    this.partida = null; // { id, anteValue, mandatoryManos, shoe }
    this.mano = null; // ManoRuntime actual, o null entre manos
    this.pausedReason = null;
  }

  roomName() {
    return `game:${this.tableId}`;
  }

  registerSocket(userId, socket) {
    this.sockets.set(userId, socket);
    socket.join(this.roomName());
    this._sendFullStateTo(userId);
  }

  unregisterSocket(userId, socket) {
    if (this.sockets.get(userId) === socket) {
      this.sockets.delete(userId);
    }
  }

  broadcastPublic(event, payload) {
    this.io.to(this.roomName()).emit(event, payload);
  }

  sendPrivate(userId, event, payload) {
    this.sockets.get(userId)?.emit(event, payload);
  }

  _sendFullStateTo(userId) {
    if (!this.mano) return;
    const pub = this.mano.getPublicState();
    // Reconstruye lo que game:manoStarted habría mandado, por si este socket
    // se conecta/reconecta después del broadcast original (se había perdido
    // manoNumber/fondo en la reconexión, dejando el encabezado mostrando "-").
    this.sendPrivate(userId, 'game:manoStarted', {
      manoNumber: this.manoNumber,
      isMandatory: pub.isMandatory,
      dealerId: pub.dealerId,
      trumpCard: pub.trumpCard,
      seatOrder: pub.seatOrder,
      fondo: this.partida?.fondo,
    });
    this.sendPrivate(userId, 'game:state', pub);
    if (this.mano.hands[userId]) {
      this.sendPrivate(userId, 'game:yourHand', { hand: this.mano.hands[userId] });
    }
    if (pub.turnUserId === userId && this.mano.phase === 'playing') {
      const { validIndexes, isAchico } = this.mano.getCurrentValidPlays();
      this.sendPrivate(userId, 'game:yourTurn', { validIndexes, isAchico });
    }
  }

  async startPartida() {
    // Protege contra doble arranque (doble clic, reintento de red, o dos
    // pestañas del creador): si ya hay una partida corriendo en memoria para
    // esta mesa, no se pisa el estado ni se crea una segunda mano en paralelo.
    if (this.partida) {
      return;
    }

    const seatOrder = await getSeatOrder(this.tableId);
    const activePartida = await getActivePartida(this.tableId);
    if (!activePartida) {
      throw new Error('No hay una partida activa para esta mesa');
    }

    this.partida = {
      id: activePartida.id,
      anteValue: activePartida.ante_value,
      mandatoryManos: activePartida.mandatory_manos,
      fondo: 0,
      shoe: createShoe(),
      seatOrderIds: seatOrder.map((p) => p.user_id),
    };

    await this._dealNextMano();
  }

  async _dealNextMano() {
    const manoCount = await countManosInPartida(this.partida.id);
    const manoNumber = manoCount + 1;
    const isMandatory = manoNumber <= this.partida.mandatoryManos;
    const dealerId = await determineNextDealer(this.tableId);

    const balances = await getTableBalances(this.tableId);
    const shortOnFunds = this.partida.seatOrderIds.filter(
      (id) => (balances[id] ?? 0) < this.partida.anteValue
    );
    if (shortOnFunds.length > 0) {
      this.pausedReason = { type: 'insufficient_funds', userIds: shortOnFunds };
      this.broadcastPublic('game:paused', this.pausedReason);
      return; // Fase 5 se encargará del flujo de recarga; por ahora la partida queda en pausa.
    }

    await chargeAnte({
      tableId: this.tableId,
      partidaId: this.partida.id,
      seatOrderIds: this.partida.seatOrderIds,
      anteValue: this.partida.anteValue,
    });
    const partidaRow = await getActivePartida(this.tableId);
    this.partida.fondo = partidaRow.fondo_acumulado;

    // Recién se les cobró la apuesta inicial a todos: que la sala de espera
    // (si alguien la sigue viendo) refleje el nuevo saldo de cada uno, en vez
    // de esperar a que la mano entera termine.
    await this._notifyLobby();

    const maxExchange = await getAdminSetting('max_card_exchange');
    const turnTimeoutSeconds = await getAdminSetting('turn_timeout_seconds');

    const dealerIndex = this.partida.seatOrderIds.indexOf(dealerId);
    const seatOrderFromDealerRight = rotateArray(this.partida.seatOrderIds, (dealerIndex + 1) % this.partida.seatOrderIds.length);

    // El reparto (y por lo tanto el triunfo) se decide en el constructor de
    // ManoRuntime, así que lo creamos primero y recién ahí registramos la
    // fila de la mano en la DB con el triunfo real ya conocido.
    this.mano = new ManoRuntime({
      shoe: this.partida.shoe,
      seatOrderFromDealerRight,
      dealerId,
      isMandatory,
      currentFondo: this.partida.fondo,
      maxExchange,
      turnTimeoutMs: turnTimeoutSeconds * 1000,
    });
    this.manoNumber = manoNumber;

    this.currentManoRowId = await createManoRow({
      partidaId: this.partida.id,
      manoNumber,
      dealerId,
      isMandatory,
      trumpSuit: this.mano.trumpCard.suit,
      fondoBefore: this.partida.fondo,
    });

    this._wireManoEvents();

    // OJO: game:manoStarted y game:yourHand deben salir ANTES de mano.start().
    // start() dispara 'stateChanged' de forma síncrona (fase 'entry' en manos
    // optativas), y ese listener ya está conectado por _wireManoEvents(), así
    // que si start() se llama primero, el cliente recibe game:state (con la
    // pregunta de si quiere entrar) antes que sus propias cartas — se veía
    // como si primero preguntara y después repartiera, al revés de lo
    // esperado.
    this.broadcastPublic('game:manoStarted', {
      manoNumber,
      isMandatory,
      dealerId,
      trumpCard: this.mano.trumpCard,
      seatOrder: seatOrderFromDealerRight,
      fondo: this.partida.fondo,
    });
    for (const userId of seatOrderFromDealerRight) {
      if (this.mano.allHands[userId]) {
        this.sendPrivate(userId, 'game:yourHand', { hand: this.mano.allHands[userId] });
      }
    }
    this.mano.start();
    this._broadcastState();
  }

  _wireManoEvents() {
    const mano = this.mano;

    mano.on('stateChanged', () => this._broadcastState());

    mano.on('entryDecided', ({ userId, entered, forced }) => {
      this.broadcastPublic('game:entryDecided', { userId, entered, forced });
    });

    mano.on('handUpdated', ({ userId, hand }) => {
      this.sendPrivate(userId, 'game:yourHand', { hand });
    });

    mano.on('cardPlayed', ({ userId, card, isAchico }) => {
      this.broadcastPublic('game:cardPlayed', { userId, card, isAchico });
    });

    mano.on('renounced', ({ userId }) => {
      this.broadcastPublic('game:renounced', { userId });
    });

    mano.on('trickFinished', (trick) => {
      this.broadcastPublic('game:trickFinished', {
        trickNumber: trick.trickNumber,
        winnerId: trick.winnerId,
        ledSuit: trick.ledSuit,
        plays: trick.plays,
      });
    });

    mano.on('manoFinished', (result) => {
      this._onManoFinished(result).catch((err) => {
        console.error(`Error cerrando la mano de la mesa ${this.tableId}:`, err);
      });
    });
  }

  _broadcastState() {
    if (!this.mano) return;
    this.broadcastPublic('game:state', this.mano.getPublicState());

    const turnUserId = this.mano.currentTurnUserId;
    if (turnUserId && this.mano.phase === 'playing') {
      const { validIndexes, isAchico } = this.mano.getCurrentValidPlays();
      this.sendPrivate(turnUserId, 'game:yourTurn', { validIndexes, isAchico });
    }
  }

  async _onManoFinished(result) {
    const manoId = this.currentManoRowId;
    // Las manos obligatorias existen justamente para construir el fondo antes
    // de que la partida pueda terminar; que TODOS los entrantes se salven en
    // una de ellas (posible por azar con pocos jugadores, ej. 3-2 con 2
    // entrantes) no debe cerrar la partida — solo una mano optativa puede
    // hacerlo.
    const partidaEnds = result.payments.partidaEnds && !this.mano.isMandatory;

    await finalizeManoRow(manoId, { fondoAfter: result.payments.newFondo });

    const entrantsInfo = result.entrants.map((userId) => ({
      userId,
      exchangedCount: result.exchangedCounts[userId] ?? 0,
      points: result.points[userId] ?? 0,
      saved: result.payments.saved.includes(userId),
      renounced: result.eliminated.includes(userId),
      paidPenalty: result.payments.notSaved.includes(userId) ? result.payments.paymentPerLoser : 0,
      receivedPayout: result.payments.payouts[userId] ?? 0,
    }));
    await insertManoPlayers(manoId, entrantsInfo);
    await insertTricks(manoId, result.tricks);
    await applyManoPayments({
      tableId: this.tableId,
      partidaId: this.partida.id,
      manoId,
      payments: result.payments,
    });

    this.partida.shoe = result.shoe;
    this.partida.fondo = result.payments.newFondo;

    // Las fichas de mesa de cada jugador cambiaron (ante + pagos/cobros de
    // esta mano); sin esto, la lista de "Jugadores sentados" de la sala de
    // espera se quedaba con el valor viejo hasta que la partida terminaba.
    await this._notifyLobby();

    this.broadcastPublic('game:manoResult', {
      manoNumber: this.manoNumber,
      trumpCard: result.trumpCard,
      points: result.points,
      saved: result.payments.saved,
      notSaved: result.payments.notSaved,
      eliminated: result.eliminated,
      paymentPerLoser: result.payments.paymentPerLoser,
      payoutPerWinner: result.payments.payoutPerWinner,
      newFondo: result.payments.newFondo,
      partidaEnds,
    });

    this.mano.destroy();
    this.mano = null;

    if (partidaEnds) {
      const { payoutPerWinner } = await finalizePartida({
        tableId: this.tableId,
        partidaId: this.partida.id,
        saved: result.payments.saved,
        fondo: result.payments.newFondo,
      });
      this.broadcastPublic('game:partidaFinished', {
        saved: result.payments.saved,
        fondoRepartido: result.payments.newFondo,
        payoutPerWinner,
      });
      this.partida = null;

      // Nadie hizo una llamada REST para llegar hasta aquí (la partida terminó
      // sola dentro del motor), así que le avisamos al lobby directamente para
      // que la sala de espera muestre la mesa en 'waiting' de nuevo (aunque el
      // resumen de la partida se queda visible en pantalla hasta que el
      // creador arranque la siguiente).
      await this._notifyLobby();
      return;
    }

    setTimeout(() => {
      this._dealNextMano().catch((err) => {
        console.error(`Error repartiendo la siguiente mano de la mesa ${this.tableId}:`, err);
        // Que quede claro para todos que algo falló, en vez de dejarlos
        // esperando en silencio para siempre (p. ej. un hipo de red entre
        // el servicio de Node y el hosting de PHP).
        this.broadcastPublic('game:error', {
          message: 'No se pudo repartir la siguiente mano. Recarga la página; si persiste, avisa al administrador.',
        });
      });
    }, NEXT_MANO_DELAY_MS + MANO_RESULT_BROADCAST_DELAY_MS);
  }

  /** Refresca el estado de la mesa (fichas de cada jugador, etc.) para quien esté viendo la sala de espera. */
  async _notifyLobby() {
    const freshTableState = await loadTableState(this.tableId);
    if (freshTableState) {
      this.io.to(lobbyRoomName(this.tableId)).emit('table:state', freshTableState);
    }
  }

  // ------------------------------------------------------------------
  // Acciones de jugador (validadas por ManoRuntime; los errores se
  // devuelven al socket que las disparó vía el callback `ack`).
  // ------------------------------------------------------------------

  handleDecideEntry(userId, entered) {
    this.mano?.decideEntry(userId, entered);
  }

  handleExchange(userId, discardIndexes) {
    this.mano?.exchange(userId, discardIndexes);
  }

  handlePlayCard(userId, cardIndex) {
    this.mano?.playCard(userId, cardIndex);
  }

  /**
   * Se llama después de que alguien recarga fichas en la mesa vía REST,
   * mientras la partida estaba en pausa por falta de fondos. Si ya no hay
   * partida activa o no estaba pausada, no hace nada.
   */
  async retryDealIfPaused() {
    if (!this.partida || !this.pausedReason || this.mano) return;
    this.pausedReason = null;
    await this._dealNextMano();
  }
}

function rotateArray(arr, startIndex) {
  return [...arr.slice(startIndex), ...arr.slice(0, startIndex)];
}
