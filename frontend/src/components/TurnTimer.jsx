import { useEffect, useState } from 'react';

export default function TurnTimer({ deadline }) {
  const [secondsLeft, setSecondsLeft] = useState(null);

  useEffect(() => {
    if (!deadline) {
      setSecondsLeft(null);
      return undefined;
    }
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadline]);

  if (secondsLeft === null) return null;

  return <span className={`turn-timer ${secondsLeft <= 5 ? 'turn-timer-urgent' : ''}`}>{secondsLeft}s</span>;
}
