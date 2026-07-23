import { useCallback, useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!socket || !connected || !tableId) return undefined;

    socket.emit('game:watch', tableId, () => {});

    const onState = (s) => {
      setState((prev) => ({ ...prev, ...s }));
      if (s.phase === 'playing' && s.currentTrick) {
        setTrickPlays(s.currentTrick.plays);
      } else if (s.phase !== 'playing') {
        setTrickPlays([]);
      }
    };

    const onManoStarted = (payload) => {
      setState((prev) => ({ ...prev, ...payload, manoResult: null, paused: null }));
      setTrickPlays([]);
      setLastTrickWinner(null);
      setMyTurn(null);
    };

    const onYourHand = ({ hand }) => setMyHand(hand);
    const onYourTurn = ({ validIndexes, isAchico }) => setMyTurn({ validIndexes, isAchico });
    const onCardPlayed = (play) => setTrickPlays((prev) => [...prev, play]);

    const onTrickFinished = (result) => {
      setMyTurn(null);
      setLastTrickWinner(result.winnerId);
      setTimeout(() => {
        setTrickPlays([]);
        setLastTrickWinner(null);
      }, 1800);
    };

    const onManoResult = (result) =>
      setState((prev) => ({ ...prev, manoResult: result, phase: 'finished', fondo: result.newFondo }));
    const onPartidaFinished = (result) => setState((prev) => ({ ...prev, partidaResult: result }));
    const onPaused = (info) => setState((prev) => ({ ...prev, paused: info }));
    const onRenounced = () => setMyTurn(null);

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
