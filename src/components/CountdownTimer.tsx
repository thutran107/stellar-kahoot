import { useState, useEffect } from 'react';

interface CountdownTimerProps {
  startTime: number;
  timeLimit: number;
  className?: string;
}

export function CountdownTimer({ startTime, timeLimit, className }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(timeLimit);

  useEffect(() => {
    if (!startTime || !timeLimit) return;
    setRemaining(timeLimit);
    let rafId: number;
    const tick = () => {
      const rem = Math.max(0, timeLimit - (Date.now() - startTime));
      setRemaining(rem);
      if (rem > 0) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [startTime, timeLimit]);

  if (!startTime || !timeLimit) return null;

  const pct = (remaining / timeLimit) * 100;
  const isLow = pct <= 30;
  const color = isLow ? '#f43f5e' : '#22d3ee';

  return (
    <div
      className={`led-digit countdown-digit font-mono text-2xl px-4 py-1 rounded-full border ${className ?? ''}`}
      style={{
        color,
        borderColor: color,
        boxShadow: `0 0 10px ${isLow ? 'rgba(244,63,94,0.5)' : 'rgba(34,211,238,0.5)'}`,
      }}
    >
      {Math.ceil(remaining / 1000)}s
    </div>
  );
}
