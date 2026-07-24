import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from './useSocket';

const initialState = {
  phase: 'idle', // 'idle' | 'entry' | 'exchange' | 'playing' | 'finished'
  dealerId: null,
  isMandatory: null,
  maxExchange: 5,
  fondo: null,
  manoNumber: null,
  trumpCard: null,
  seatOrder: [],
  entrants: [],
  nonEntrants: [],
  turnUserId: null,
  turnDeadline: null,
  points: {},
  eliminated: [],
  manoResult: null,
  partidaResult: null,
  paused: null,
  serverError: null,
};

/**
 * Centraliza toda la sincronización en vivo de una mesa/partida: escucha los
 * eventos game:* del socket y expone un estado plano + acciones (decideEntry,
 * exchange, playCard, startPartida) para que la UI no tenga que tocar sockets
 * directamente.
 */
export function useGameSocket(tableId) {
  const { socket, connected } = useSocket();
  const [state, setState] = useState(initialState);
  const [myHand, setMyHand] = useState([]);
  const [myTurn, setMyTurn] = useState(null); // { validIndexes, isAchico }
  const [trickPlays, setTrickPlays] = useState([]);
  const [lastTrickWinner, setLastTrickWinner] = useState(null);
  // Mientras está "congelada" se sigue mostrando la última baza completa (con
  // quién y con qué carta ganó) hasta que de verdad empiece la siguiente
  // (llegue la primera carta jugada de esa nueva baza). Un ref porque los
  // callbacks del socket la leen fuera del ciclo de render de React.
  const frozenRef = useRef(false);

  useEffect(() => {
    if (!socket || !connected || !tableId) return undefined;

    socket.emit('game:watch', tableId, () => {});

    const onState = (s) => {
      setState((prev) => ({ ...prev, ...s }));
      if (s.phase === 'playing' && s.currentTrick) {
        // Mientras está congelada mostrando la baza recién terminada, un
        // game:state de fondo (el servidor ya armó la próxima baza vacía
        // internamente) no debe borrar lo que se está mostrando.
        if (!frozenRef.current) {
          setTrickPlays(s.currentTrick.plays);
        }
      } else if (s.phase !== 'playing') {
        frozenRef.current = false;
        setTrickPlays([]);
      }
    };

    const onManoStarted = (payload) => {
      setState((prev) => ({ ...prev, ...payload, manoResult: null, partidaResult: null, paused: null }));
      frozenRef.current = false;
      setTrickPlays([]);
      setLastTrickWinner(null);
      setMyTurn(null);
    };

    const onYourHand = ({ hand }) => setMyHand(hand);
    const onYourTurn = ({ validIndexes, isAchico }) => setMyTurn({ validIndexes, isAchico });
    const onCardPlayed = (play) => {
      if (frozenRef.current) {
        // Esta es la primera carta de la baza nueva: recién ahora se limpia
        // la anterior, que se mantuvo visible todo el tiempo que hizo falta.
        frozenRef.current = false;
        setTrickPlays([play]);
        setLastTrickWinner(null);
      } else {
        setTrickPlays((prev) => [...prev, play]);
      }
    };

    const onTrickFinished = (result) => {
      setMyTurn(null);
      setLastTrickWinner(result.winnerId);
      frozenRef.current = true;
    };

    const onManoResult = (result) =>
      setState((prev) => ({ ...prev, manoResult: result, phase: 'finished', fondo: result.newFondo }));
    const onPartidaFinished = (result) => setState((prev) => ({ ...prev, partidaResult: result }));
    const onPaused = (info) => setState((prev) => ({ ...prev, paused: info }));
    const onRenounced = () => setMyTurn(null);
    const onServerError = (info) => setState((prev) => ({ ...prev, serverError: info.message }));

    socket.on('game:state', onState);
    socket.on('game:manoStarted', onManoStarted);
    socket.on('game:yourHand', onYourHand);
    socket.on('game:yourTurn', onYourTurn);
    socket.on('game:cardPlayed', onCardPlayed);
    socket.on('game:trickFinished', onTrickFinished);
    socket.on('game:manoResult', onManoResult);
    socket.on('game:partidaFinished', onPartidaFinished);
    socket.on('game:paused', onPaused);
    socket.on('game:renounced', onRenounced);
    socket.on('game:error', onServerError);

    return () => {
      socket.emit('game:unwatch', tableId);
      socket.off('game:state', onState);
      socket.off('game:manoStarted', onManoStarted);
      socket.off('game:yourHand', onYourHand);
      socket.off('game:yourTurn', onYourTurn);
      socket.off('game:cardPlayed', onCardPlayed);
      socket.off('game:trickFinished', onTrickFinished);
      socket.off('game:manoResult', onManoResult);
      socket.off('game:partidaFinished', onPartidaFinished);
      socket.off('game:paused', onPaused);
      socket.off('game:renounced', onRenounced);
      socket.off('game:error', onServerError);
    };
  }, [socket, connected, tableId]);

  const startPartida = useCallback(
    () =>
      new Promise((resolve, reject) => {
        socket.emit('game:startPartida', tableId, (res) => (res?.ok ? resolve() : reject(new Error(res?.error))));
      }),
    [socket, tableId]
  );

  const decideEntry = useCallback(
    (entered) => {
      socket.emit('game:decideEntry', tableId, entered, (res) => {
        if (!res?.ok) console.error(res?.error);
      });
    },
    [socket, tableId]
  );

  const exchange = useCallback(
    (discardIndexes) => {
      socket.emit('game:exchange', tableId, discardIndexes, (res) => {
        if (!res?.ok) console.error(res?.error);
      });
    },
    [socket, tableId]
  );

  const playCard = useCallback(
    (cardIndex) => {
      socket.emit('game:playCard', tableId, cardIndex, (res) => {
        if (!res?.ok) console.error(res?.error);
      });
      setMyTurn(null);
    },
    [socket, tableId]
  );

  const retryDeal = useCallback(
    () =>
      new Promise((resolve, reject) => {
        socket.emit('game:retryDeal', tableId, (res) => (res?.ok ? resolve() : reject(new Error(res?.error))));
      }),
    [socket, tableId]
  );

  return {
    ...state,
    myHand,
    myTurn,
    trickPlays,
    lastTrickWinner,
    connected,
    startPartida,
    decideEntry,
    exchange,
    playCard,
    retryDeal,
  };
}
