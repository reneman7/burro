import { useEffect, useMemo, useState } from 'react';
import Card, { SUIT_SYMBOL } from './Card';
import TurnTimer from './TurnTimer';
import { useGameSocket } from '../hooks/useGameSocket';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { formatMoney } from '../utils/money';

const SUIT_LABEL = { diamantes: 'Diamantes', espadas: 'Espadas', corazones: 'Corazones', treboles: 'Tréboles' };

const PHASE_ACTION_LABEL = {
  entry: 'decidiendo si entra',
  exchange: 'cambiando cartas',
  playing: 'pensando qué carta tirar',
};

export default function GameTable({
  table,
  currentUserId,
  canStartPartida,
  onPartidaFinished,
  onNewPartida,
  onCloseTable,
  closing,
}) {
  const { token, refreshUser } = useAuth();
  const game = useGameSocket(table.id);
  const [selectedToDiscard, setSelectedToDiscard] = useState([]);
  const [topupAmount, setTopupAmount] = useState(20);
  const [topupError, setTopupError] = useState('');
  const [toppingUp, setToppingUp] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [manoHistory, setManoHistory] = useState([]);

  // El servidor marca la mesa como 'waiting' apenas termina la partida (para
  // poder arrancar otra), pero el resumen final se queda visible en pantalla
  // hasta que el creador decide pasar a la siguiente pantalla.
  useEffect(() => {
    if (game.partidaResult) onPartidaFinished?.();
  }, [game.partidaResult, onPartidaFinished]);

  // Se refresca cada vez que termina una mano, para que el historial ya
  // tenga la última mano lista apenas se abra el panel.
  useEffect(() => {
    let active = true;
    api
      .getManoHistory(token, table.code)
      .then((res) => active && setManoHistory(res.manos))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token, table.code, game.manoResult]);

  const usernameOf = useMemo(() => {
    const map = Object.fromEntries(table.players.map((p) => [p.user_id, p.username]));
    return (userId) => map[userId] ?? `#${userId}`;
  }, [table.players]);

  const balanceOf = useMemo(() => {
    const map = Object.fromEntries(table.players.map((p) => [p.user_id, p.table_balance]));
    return (userId) => map[userId];
  }, [table.players]);

  const isMyTurn = game.turnUserId === currentUserId;
  const iAmEntrant = game.entrants.includes(currentUserId);
  const winningCard = game.trickPlays.find((p) => p.userId === game.lastTrickWinner)?.card;

  // Un solo estado por asiento a la vez (nunca se acumulan): lo que está
  // haciendo AHORA (si le toca) manda sobre lo último que ya resolvió.
  function seatStatus(userId) {
    if (game.turnUserId === userId && PHASE_ACTION_LABEL[game.phase]) {
      return { text: PHASE_ACTION_LABEL[game.phase], isTurn: true };
    }
    if (game.eliminated.includes(userId)) return { text: 'Renunció' };
    if (game.phase === 'playing' && game.lastPlayedByUser?.[userId]) {
      const card = game.lastPlayedByUser[userId];
      return { text: `Bajó ${card.rank}${SUIT_SYMBOL[card.suit] ?? ''}` };
    }
    if (typeof game.exchangedCounts?.[userId] === 'number') {
      const n = game.exchangedCounts[userId];
      return { text: n > 0 ? `Cambió ${n} carta(s)` : 'No cambió cartas' };
    }
    if (game.nonEntrants.includes(userId)) return { text: 'No entró' };
    if (game.entrants.includes(userId)) return { text: 'Entró' };
    return null;
  }

  function toggleDiscard(index) {
    setSelectedToDiscard((prev) => {
      if (prev.includes(index)) return prev.filter((i) => i !== index);
      if (prev.length >= game.maxExchange) return prev;
      return [...prev, index];
    });
  }

  function confirmExchange() {
    game.exchange(selectedToDiscard);
    setSelectedToDiscard([]);
  }

  function playCard(index) {
    // No se bloquea ninguna carta: si no es una jugada válida, el servidor
    // la rechaza y la resuelve como renuncia, en vez de impedir el clic.
    game.playCard(index);
  }

  async function handleTopup(e) {
    e.preventDefault();
    setTopupError('');
    setToppingUp(true);
    try {
      await api.topupTable(token, table.code, Number(topupAmount));
      await refreshUser();
      await game.retryDeal();
    } catch (err) {
      setTopupError(err.message);
    } finally {
      setToppingUp(false);
    }
  }

  return (
    <div className="game-table">
      <div className="game-header">
        <div>
          Mano {game.manoNumber ?? '-'}{' '}
          {game.isMandatory === null ? '' : game.isMandatory ? '(obligatoria)' : '(optativa)'}
        </div>
        {typeof game.fondo === 'number' && <div>Fondo acumulado: {formatMoney(game.fondo)}</div>}
        {!game.connected && <div className="achico-tag">Conectando en vivo...</div>}
      </div>

      <div className="mano-history">
        <button type="button" className="link-button mano-history-toggle" onClick={() => setHistoryOpen((o) => !o)}>
          {historyOpen ? '▲' : '▼'} Historial de manos
        </button>
        {historyOpen && (
          <div className="mano-history-panel">
            {manoHistory.length === 0 && <p className="hint">Todavía no hay manos jugadas en esta partida.</p>}
            {manoHistory.map((m) => (
              <div key={m.mano_number} className="mano-history-row">
                <div className="mano-history-head">
                  <span>Mano {m.mano_number}</span>
                  <span className="hint">{m.is_mandatory ? 'obligatoria' : 'optativa'}</span>
                </div>
                <div className="mano-history-players">
                  {m.players.map((p) => (
                    <span
                      key={p.user_id}
                      className={`mano-history-chip ${
                        p.renounced ? 'chip-danger' : p.saved ? 'chip-success' : ''
                      }`}
                    >
                      {p.username} · {p.renounced ? 'renunció' : `${p.points} pts`}
                    </span>
                  ))}
                </div>
                {m.tricks.length > 0 && (
                  <div className="mano-history-tricks">
                    {m.tricks.map((t) => (
                      <div key={t.trick_number} className="mano-history-trick">
                        <span className="hint mano-history-trick-label">B{t.trick_number}</span>
                        {t.plays.map((p) => (
                          <div
                            key={p.user_id}
                            className={`trick-play ${t.winner_user_id === p.user_id ? 'trick-play-winner' : ''}`}
                          >
                            <Card card={p.card} small />
                            <span>{p.username}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {game.serverError && (
        <div className="banner banner-warning">
          <p>{game.serverError}</p>
        </div>
      )}

      {isMyTurn && PHASE_ACTION_LABEL[game.phase] && (
        <div className="banner banner-your-turn">
          <p>¡Es tu turno! Estás {PHASE_ACTION_LABEL[game.phase]}.</p>
        </div>
      )}

      {game.paused && (
        <div className="banner banner-warning">
          <p>
            Partida en pausa: a {game.paused.userIds.map(usernameOf).join(', ')} no le(s) alcanzan las fichas de mesa
            para la siguiente apuesta.
          </p>
          {game.paused.userIds.includes(currentUserId) && (
            <form onSubmit={handleTopup} className="action-row">
              <label>
                Agregar fichas a esta mesa (desde tu saldo global)
                <input
                  type="number"
                  min={1}
                  step="0.01"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  required
                />
              </label>
              <button type="submit" disabled={toppingUp}>
                {toppingUp ? 'Recargando...' : 'Recargar y continuar'}
              </button>
            </form>
          )}
          {topupError && <p className="error">{topupError}</p>}
        </div>
      )}

      <div className="player-cards">
        {game.seatOrder.map((userId, i, seats) => {
          const status = seatStatus(userId);
          const balance = balanceOf(userId);
          const spanFull = i === seats.length - 1 && seats.length % 2 !== 0;
          return (
            <div
              key={userId}
              className={`player-card ${game.turnUserId === userId ? 'player-card-active' : ''} ${
                game.eliminated.includes(userId) ? 'player-card-eliminated' : ''
              }`}
              style={spanFull ? { gridColumn: 'span 2' } : undefined}
            >
              <div className="player-card-head">
                <span className="player-card-name">
                  <span className="player-avatar">{usernameOf(userId).charAt(0).toUpperCase()}</span>
                  {usernameOf(userId)} {userId === game.dealerId && <span title="Dealer">🎴</span>}
                </span>
                {game.turnUserId === userId && <TurnTimer deadline={game.turnDeadline} />}
              </div>
              <div className="player-card-meta">
                {game.points[userId] ?? 0} pts
                {typeof balance === 'number' && ` · ${formatMoney(balance)} fichas`}
              </div>
              {status && <div className={`seat-tag ${status.isTurn ? 'seat-turn-label' : ''}`}>{status.text}</div>}
            </div>
          );
        })}
      </div>

      <div className="table-strip">
        {game.trumpCard && (
          <div className="table-strip-trump">
            <span className="hint">Triunfo</span>
            <Card card={game.trumpCard} small />
            <span className="hint">{SUIT_LABEL[game.trumpCard.suit]}</span>
          </div>
        )}
        <div className="table-strip-trick">
          {game.lastTrickWinner && (
            <p className="trick-winner-banner">
              🏆 {usernameOf(game.lastTrickWinner)} ganó
              {winningCard && (
                <>
                  {' '}
                  con <Card card={winningCard} small />
                </>
              )}
            </p>
          )}
          {game.trickPlays.length === 0 && game.phase === 'playing' && (
            <p className="hint">Esperando la primera carta...</p>
          )}
          <div className="table-strip-plays">
            {game.trickPlays.map((play, i) => (
              <div
                key={i}
                className={`trick-play ${game.lastTrickWinner === play.userId ? 'trick-play-winner' : ''}`}
              >
                <Card card={play.card} small />
                <span>{usernameOf(play.userId)}</span>
                {play.isAchico && <span className="achico-tag">me achico</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {game.phase === 'entry' && (
        <div className="panel">
          {isMyTurn ? (
            <>
              <p>¿Quieres entrar a esta mano optativa?</p>
              <div className="action-row">
                <button onClick={() => game.decideEntry(true)}>Entrar</button>
                <button onClick={() => game.decideEntry(false)}>No entrar</button>
              </div>
            </>
          ) : (
            <p>
              Esperando la decisión de {game.turnUserId ? usernameOf(game.turnUserId) : '...'}{' '}
              <TurnTimer deadline={game.turnDeadline} />
            </p>
          )}
        </div>
      )}

      {game.myHand.length > 0 && (
        <div className="my-hand">
          <h3>Tu mano</h3>
          <div className="hand-cards">
            {game.myHand.map((card, i) => {
              const cardKey = `${card.rank}${card.suit}`;
              if (game.phase === 'exchange' && isMyTurn) {
                return (
                  <Card
                    key={cardKey}
                    card={card}
                    selectable
                    selected={selectedToDiscard.includes(i)}
                    onClick={() => toggleDiscard(i)}
                  />
                );
              }
              if (game.phase === 'playing' && isMyTurn) {
                return <Card key={cardKey} card={card} selectable onClick={() => playCard(i)} />;
              }
              return <Card key={cardKey} card={card} selectable={false} />;
            })}
          </div>

          {game.phase === 'exchange' && isMyTurn && (
            <div className="action-row">
              <button onClick={confirmExchange}>
                Confirmar cambio ({selectedToDiscard.length}/{game.maxExchange})
              </button>
            </div>
          )}
          {game.phase === 'exchange' && !isMyTurn && (
            <p>
              Esperando el intercambio de {game.turnUserId ? usernameOf(game.turnUserId) : '...'}{' '}
              <TurnTimer deadline={game.turnDeadline} />
            </p>
          )}
          {game.phase === 'playing' && isMyTurn && game.myTurn?.isAchico && (
            <p className="achico-tag">No tienes con qué superar: te achicas, cualquier carta vale.</p>
          )}
          {game.phase === 'playing' && !isMyTurn && (
            <p>
              Le toca a {game.turnUserId ? usernameOf(game.turnUserId) : '...'} <TurnTimer deadline={game.turnDeadline} />
            </p>
          )}
        </div>
      )}

      {!iAmEntrant && game.phase !== 'idle' && game.myHand.length === 0 && (
        <p>No entraste a esta mano. Estás viendo la partida como espectador hasta la siguiente.</p>
      )}

      {game.manoResult && (
        <div className="banner banner-result">
          <h3>Resultado de la mano {game.manoResult.manoNumber}</h3>
          <p>
            Se salvaron: {game.manoResult.saved.map(usernameOf).join(', ') || 'nadie'}
            {game.manoResult.payoutPerWinner > 0 &&
              ` (cada uno recibió ${formatMoney(game.manoResult.payoutPerWinner)})`}
          </p>
          <p>
            No se salvaron: {game.manoResult.notSaved.map(usernameOf).join(', ') || 'nadie'}
            {game.manoResult.paymentPerLoser > 0 &&
              ` (cada uno pagó ${formatMoney(game.manoResult.paymentPerLoser)})`}
          </p>
          {game.manoResult.eliminated.length > 0 && (
            <p>Renunciaron: {game.manoResult.eliminated.map(usernameOf).join(', ')}</p>
          )}
          <p>Fondo acumulado ahora: {formatMoney(game.manoResult.newFondo)}</p>
          {!game.manoResult.partidaEnds && <p>La partida continúa con otra mano en unos segundos...</p>}
        </div>
      )}

      {game.partidaResult && (
        <div className="banner banner-result banner-final">
          <h3>¡Partida terminada!</h3>
          <p>Se repartió el fondo entre: {game.partidaResult.saved.map(usernameOf).join(', ')}</p>
          <p>Fondo repartido: {formatMoney(game.partidaResult.fondoRepartido)}</p>
          {game.partidaResult.payoutPerWinner > 0 && (
            <p>Cada uno recibió: {formatMoney(game.partidaResult.payoutPerWinner)}</p>
          )}
          {canStartPartida ? (
            <div className="action-row">
              <button onClick={() => onNewPartida?.()}>Nueva partida</button>
              <button onClick={() => onCloseTable?.()} disabled={closing} className="danger">
                {closing ? 'Cerrando...' : 'Cerrar mesa'}
              </button>
            </div>
          ) : (
            <p>Esperando a que se arranque una nueva partida...</p>
          )}
        </div>
      )}
    </div>
  );
}
