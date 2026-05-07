import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { History, ArrowLeft, ChevronRight } from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface GameSession {
  id: string;
  pin: string;
  state: string;
  started_at: string | null;
  ended_at: string | null;
  quiz_title: string;
  participant_count: number;
}

export function GameHistoryPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/games')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => { setSessions(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => navigate('/quizzes')}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <History className="text-neon-blue" /> Past Games
          </h1>
          <p className="text-gray-500 text-sm font-mono mt-1">Your completed game sessions</p>
        </div>
      </div>

      {loading && (
        <div className="text-center text-gray-500 font-mono py-20">Loading...</div>
      )}

      {!loading && sessions.length === 0 && (
        <div className="text-center text-gray-500 font-mono py-20">
          No games played yet. Host a quiz to get started!
        </div>
      )}

      <div className="space-y-4">
        {sessions.map((s, i) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass p-5 rounded-2xl flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer"
            onClick={() => navigate(`/games/${s.id}`)}
          >
            <div>
              <div className="font-bold text-lg text-white">{s.quiz_title}</div>
              <div className="text-gray-400 text-sm font-mono mt-1">
                {s.started_at
                  ? new Date(s.started_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })
                  : 'Not started'}
                {' · '}PIN {s.pin}
                {' · '}{s.participant_count} player{s.participant_count !== 1 ? 's' : ''}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-mono px-2 py-1 rounded-lg border ${
                s.state === 'ended'
                  ? 'bg-neon-green/10 text-neon-green border-neon-green/20'
                  : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
              }`}>
                {s.state === 'ended' ? 'Ended' : s.state}
              </span>
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
