import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { api } from '../api/client';
import GameTable from '../components/GameTable';
import { formatMoney } from '../utils/money';

export default function Mesa() {
  const { code } = useParams();
  const { user, token } = useAuth();
  const { socket, connected } = useSocket();
  const navigate = useNavigate();

  const [table, setTable] = useState(null);
  const [error, setError] = useState('');

  const [joinBuyIn, setJoinBuyIn] = useState(10);
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);

  const [newAnte, setNewAnte] = useState('');
  const [anteError, setAnteError] = useState('');

  const [mandatoryManos, setMandatoryManos] = useState(1);
  const [startError, setStartError] = useState('');
  const [starting, setStarting] = useState(false);

  // Cuando una partida termina, el servidor marca la mesa como 'waiting' de
  // inmediato (para que se pueda arrancar otra), pero no queremos que el
  // resumen final desaparezca de la pantalla solo por eso: se queda visible
  // hasta que el creador decida pasar a la siguiente pantalla.
  const [showingPartidaEnd, setShowingPartidaEnd] = useState(false);

  // Carga inicial vía REST + suscripción en vivo por socket.
  useEffect(() => {
    let active = true;
    api
      .getTable(token, code)
      .then((data) => active && setTable(data))
      .catch((err) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, [code, token]);

  useEffect(() => {
    if (!socket || !connected || !table) return;

    socket.emit('table:watch', table.id, (res) => {
      if (res?.ok) setTable(res.state);
    });

    function onState(state) {
      if (state.id === table.id) setTable(state);
    }
    socket.on('table:state', onState);

    return () => {
      socket.emit('table:unwatch', table.id);
      socket.off('table:state', onState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, connected, table?.id]);

  function broadcastRefresh(tableId) {
    socket?.emit('table:refresh', tableId);
  }

  async function handleJoin(e) {
    e.preventDefault();
    setJoinError('');
    setJoining(true);
    try {
      const state = await api.joinTable(token, { code, buyIn: Number(joinBuyIn) });
      setTable(state);
      broadcastRefresh(state.id);
    } catch (err) {
      setJoinError(err.message);
    } finally {
      setJoining(false);
    }
  }

  async function handleAnteChange(e) {
    e.preventDefault();
    setAnteError('');
    try {
      const state = await api.updateAnte(token, code, Number(newAnte));
      setTable(state);
      broadcastRefresh(state.id);
    } catch (err) {
      setAnteError(err.message);
    }
  }

  async function handleStart(e) {
    e.preventDefault();
    setStartError('');
    setStarting(true);
    try {
      const state = await api.startPartida(token, code, Number(mandatoryManos));
      setTable(state);
      broadcastRefresh(state.id);
      await new Promise((resolve, reject) => {
        socket.emit('game:startPartida', state.id, (res) => (res?.ok ? resolve() : reject(new Error(res?.error))));
      });
    } catch (err) {
      setStartError(err.message);
    } finally {
      setStarting(false);
    }
  }

  if (error) {
    return (
      <div className="mesa-page">
        <p className="error">{error}</p>
        <button onClick={() => navigate('/')}>Volver al lobby</button>
      </div>
    );
  }

  if (!table) {
    return <p>Cargando mesa...</p>;
  }

  const isMember = table.players.some((p) => p.user_id === user.id);
  const isCreator = table.created_by === user.id;
  const shareLink = `${window.location.origin}/#/mesa/${table.code}`;

  return (
    <div className="mesa-page">
      <header>
        <h1>{table.name}</h1>
        <button onClick={() => navigate('/')}>Volver al lobby</button>
      </header>

      <p>
        Código: <code>{table.code}</code> · Link para invitar:{' '}
        <input readOnly value={shareLink} onClick={(e) => e.target.select()} />
      </p>
      <p>
        Estado: <strong>{table.status}</strong> · Apuesta inicial actual:{' '}
        <strong>{formatMoney(table.ante_value)}</strong> {!connected && '· (conectando en vivo...)'}
      </p>

      <h2>Jugadores sentados</h2>
      <ol className="seat-list">
        {table.players.map((p) => (
          <li key={p.user_id}>
            {p.username} {p.user_id === table.created_by && '👑'} — {formatMoney(p.table_balance)} fichas de mesa
          </li>
        ))}
      </ol>

      {!isMember && table.status !== 'playing' && (
        <form className="panel" onSubmit={handleJoin}>
          <h2>Unirse a esta mesa</h2>
          <label>
            Monto de entrada
            <input
              type="number"
              min={table.ante_value}
              step="0.01"
              value={joinBuyIn}
              onChange={(e) => setJoinBuyIn(e.target.value)}
              required
            />
          </label>
          {joinError && <p className="error">{joinError}</p>}
          <button type="submit" disabled={joining}>
            {joining ? 'Uniendo...' : 'Unirse'}
          </button>
        </form>
      )}

      {isCreator && table.status === 'waiting' && (
        <div className="panel">
          <h2>Controles del creador</h2>
          <form onSubmit={handleAnteChange}>
            <label>
              Cambiar apuesta inicial
              <input
                type="number"
                min={1}
                step="0.01"
                placeholder={table.ante_value}
                value={newAnte}
                onChange={(e) => setNewAnte(e.target.value)}
              />
            </label>
            {anteError && <p className="error">{anteError}</p>}
            <button type="submit">Actualizar apuesta</button>
          </form>

          <form onSubmit={handleStart}>
            <label>
              Manos obligatorias
              <input
                type="number"
                min={1}
                value={mandatoryManos}
                onChange={(e) => setMandatoryManos(e.target.value)}
                required
              />
            </label>
            {startError && <p className="error">{startError}</p>}
            <button type="submit" disabled={starting || table.players.length < 3}>
              {starting ? 'Iniciando...' : 'Iniciar partida'}
            </button>
            {table.players.length < 3 && <p>Se necesitan al menos 3 jugadores.</p>}
          </form>
        </div>
      )}

      {(table.status === 'playing' || showingPartidaEnd) && (
        <GameTable
          table={table}
          currentUserId={user.id}
          isCreator={isCreator}
          onPartidaFinished={() => setShowingPartidaEnd(true)}
          onNewPartida={() => setShowingPartidaEnd(false)}
        />
      )}
    </div>
  );
}
