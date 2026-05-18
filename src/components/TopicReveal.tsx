import { useState, useEffect } from 'react';
import { TOPIC_META, TopicKey } from '../lib/topics';

interface Props {
  topic: string;
}

export function TopicRevealScreen({ topic }: Props) {
  const [count, setCount] = useState(3);
  const meta = TOPIC_META[topic as TopicKey];

  useEffect(() => {
    if (count <= 0) return;
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8">
      <p className="text-gray-400 font-mono uppercase tracking-widest text-sm">Next Topic</p>
      <div className={`px-12 py-8 rounded-3xl border glass text-center ${meta.bg}`}>
        <span className={`text-6xl font-black uppercase tracking-widest ${meta.color}`}>
          {meta.label}
        </span>
      </div>
      <p className="text-gray-500 font-mono text-lg">Get ready…</p>
      <span className="text-5xl font-black text-white/40 font-mono tabular-nums">
        {count > 0 ? count : ''}
      </span>
    </div>
  );
}
