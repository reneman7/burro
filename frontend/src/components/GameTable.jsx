import { useMemo, useState } from 'react';
import Card from './Card';
import TurnTimer from './TurnTimer';
import { useGameSocket } from '../hooks/useGameSocket';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

const SUIT_LABEL = { diamantes: 'Diamantes', espadas: 'Espadas', corazones: 'Corazones', treboles: 'Tréboles' };

export default function GameTable({ table, currentUserId }) {
  const { token, refreshUser } = useAuth();
  const game = useGameSocket(table.id);
  const [selectedToDiscard, setSelectedToDiscard] = useState([]);
  const [topupAmount, setTopupAmount] = useState(20);
  const [topupError, setTopupError] = useState('');
  const [toppingUp, setToppingUp] = useState(false);

  const usernameOf = useMemo(() => {
    const map = Object.fromEntries(table.players.map((p) => [p.user_id, p.username]));
    return (userId) => map[userId] ?? `#${userId}`;
  }, [table.players]);

  const isMyTurn = game.turnUserId === currentUserId;
  const iAmEntrant = game.entrants.includes(currentUserId);

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
    if (!game.myTurn?.validIndexes.includes(index)) return;
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
          Mano {game.manoNumber ?? '-'} {game.isMandatory ? '(obligatoria)' : '(optativa)'}
        </div>
        {game.trumpCard && (
          <div className="trump-indicator">
            Triunfo: <Card card={game.trumpCard} small /> <span>{SUIT_LABEL[game.trumpCard.suit]}</span>
          </div>
        )}
        {typeof game.fondo === 'number' && <div>Fondo acumulado: {game.fondo}</div>}
      </div>

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

      <div className="seats">
        {game.seatOrder.map((userId) => (
          <div
            key={userId}
            className={`seat ${game.turnUserId === userId ? 'seat-active' : ''} ${
              game.eliminated.includes(userId) ? 'seat-eliminated' : ''
            }`}
          >
            <div className="seat-name">
              {usernameOf(userId)} {userId === game.dealerId && <span title="Dealer">🎴</span>}
            </div>
            <div className="seat-points">{game.points[userId] ?? 0} pts</div>
            {game.nonEntrants.includes(userId) && <div className="seat-tag">No entró</div>}
            {game.eliminated.includes(userId) && <div className="seat-tag">Renunció</div>}
            {game.turnUserId === userId && <TurnTimer deadline={game.turnDeadline} />}
          </div>
        ))}
      </div>

      <div className="trick-area">
        {game.trickPlays.length === 0 && game.phase === 'playing' && <p>Esperando la primera carta de la baza...</p>}
        {game.trickPlays.map((play, i) => (
          <div
            key={i}
            className={`trick-play ${game.lastTrickWinner === play.userId ? 'trick-play-winner' : ''}`}
          >
            <Card card={play.card} />
            <span>{usernameOf(play.userId)}</span>
            {play.isAchico && <span className="achico-tag">me achico</span>}
          </div>
        ))}
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
              if (game.phase === 'exchange' && isMyTurn) {
                return (
                  <Card
                    key={i}
                    card={card}
                    selectable
                    selected={selectedToDiscard.includes(i)}
                    onClick={() => toggleDiscard(i)}
                  />
                );
              }
              if (game.phase === 'playing' && isMyTurn) {
                return (
                  <Card key={i} card={card} selectable={game.myTurn?.validIndexes.includes(i)} onClick={() => playCard(i)} />
                );
              }
              return <Card key={i} card={card} selectable={false} />;
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
          <p>Se salvaron: {game.manoResult.saved.map(usernameOf).join(', ') || 'nadie'}</p>
          <p>No se salvaron: {game.manoResult.notSaved.map(usernameOf).join(', ') || 'nadie'}</p>
          {game.manoResult.eliminated.length > 0 && (
            <p>Renunciaron: {game.manoResult.eliminated.map(usernameOf).join(', ')}</p>
          )}
          <p>Fondo acumulado ahora: {game.manoResult.newFondo}</p>
          {!game.manoResult.partidaEnds && <p>La partida continúa con otra mano en unos segundos...</p>}
        </div>
      )}

      {game.partidaResult && (
        <div className="banner banner-result banner-final">
          <h3>¡Partida terminada!</h3>
          <p>Se repartió el fondo entre: {game.partidaResult.saved.map(usernameOf).join(', ')}</p>
          <p>Fondo repartido: {game.partidaResult.fondoRepartido}</p>
          <p>Vuelve a la sala de espera para definir la apuesta y comenzar una nueva partida.</p>
        </div>
      )}
    </div>
  );
}
