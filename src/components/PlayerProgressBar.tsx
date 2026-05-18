import { useState, useEffect } from 'react';

interface PlayerProgressBarProps {
  startTime: number;
  timeLimit: number;
}

export function PlayerProgressBar({ startTime, timeLimit }: PlayerProgressBarProps) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!startTime || !timeLimit) return;
    setProgress(100);
    let rafId: number;
    const tick = () => {
      const rem = Math.max(0, timeLimit - (Date.now() - startTime));
      setProgress((rem / timeLimit) * 100);
      if (rem > 0) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [startTime, timeLimit]);

  if (!startTime || !timeLimit) return null;

  const isLow = progress <= 30;
  const fillColor = isLow ? '#f43f5e' : '#22d3ee';

  return (
    <div className="w-full bg-white/10 rounded-full h-3 my-4">
      <div
        className="h-3 rounded-full"
        style={{
          width: `${progress}%`,
          backgroundColor: fillColor,
          boxShadow: `0 0 8px ${isLow ? 'rgba(244,63,94,0.6)' : 'rgba(34,211,238,0.6)'}`,
          transition: 'background-color 0.3s ease',
        }}
      />
    </div>
  );
}
