import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface Participant {
  id: string;
  display_name: string;
  avatar_color: string;
  avatar_emoji: string;
  total_score: number;
}

interface Question {
  id: string;
  text: string;
  options: string[];
  correct_index: number;
  order_index: number;
  answer_counts: number[];
}

interface GameDetail {
  session: {
    id: string;
    pin: string;
    state: string;
    started_at: string | null;
    ended_at: string | null;
    quiz_title: string;
  };
  participants: Participant[];
  questions: Question[];
}

const RANK_MEDALS = ['🏆', '🥈', '🥉'];
const RANK_COLORS = ['text-yellow-400', 'text-gray-300', 'text-orange-500'];

export function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<GameDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/api/games/${id}`)
      .then((r) => r.json())
      .then((data) => { setDetail(data); setLoading(false); });
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 font-mono">
        Loading...
      </div>
    );
  }

  if (!detail || !detail.session) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 font-mono">
        Session not found.
      </div>
    );
  }

  const { session, participants, questions } = detail;

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-2">
        <button
          onClick={() => navigate('/games')}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-3xl font-black tracking-tight">{session.quiz_title}</h1>
          <p className="text-gray-500 text-sm font-mono mt-1">
            {session.started_at
              ? new Date(session.started_at).toLocaleDateString('en-US', {
                  month: 'long', day: 'numeric', year: 'numeric',
                })
              : ''}
            {' · '}PIN {session.pin}
            {' · '}{participants.length} player{participants.length !== 1 ? 's' : ''}
            {' · '}{questions.length} question{questions.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Final Scores */}
      <section className="mb-8 mt-8">
        <h2 className="text-xs font-mono text-gray-500 uppercase tracking-widest mb-4">
          Final Scores
        </h2>
        <div className="space-y-3">
          {participants.map((p, i) => (
            <div
              key={p.id}
              className="glass p-4 rounded-xl flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <span className={`font-mono font-bold w-6 text-right ${RANK_COLORS[i] ?? 'text-gray-500'}`}>
                  {i < 3 ? RANK_MEDALS[i] : `${i + 1}.`}
                </span>
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center border border-white/20 text-lg"
                  style={{
                    backgroundColor: p.avatar_color,
                    boxShadow: `0 0 8px ${p.avatar_color}50`,
                  }}
                >
                  {p.avatar_emoji}
                </div>
                <span className="font-bold text-white">{p.display_name}</span>
              </div>
              <span className="font-mono text-neon-blue font-bold">
                {p.total_score.toLocaleString()} pts
              </span>
            </div>
          ))}
          {participants.length === 0 && (
            <p className="text-gray-500 font-mono text-center py-4">
              No participants recorded.
            </p>
          )}
        </div>
      </section>

      {/* Question Breakdown */}
      <section>
        <h2 className="text-xs font-mono text-gray-500 uppercase tracking-widest mb-4">
          Question Breakdown
        </h2>
        <div className="space-y-4">
          {questions.map((q, qi) => {
            const total = q.answer_counts.reduce((a, b) => a + b, 0);
            return (
              <div key={q.id} className="glass p-5 rounded-2xl">
                <div className="font-bold text-white mb-4">
                  Q{qi + 1} — {q.text}
                </div>
                <div className="space-y-3">
                  {q.options.map((opt, i) => {
                    const count = q.answer_counts[i] ?? 0;
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    const isCorrect = i === q.correct_index;
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className={`text-sm font-medium ${
                              isCorrect ? 'text-neon-green' : 'text-gray-400'
                            }`}
                          >
                            {opt}{isCorrect ? ' ✓' : ''}
                          </span>
                          <span
                            className={`text-sm font-mono ${
                              isCorrect ? 'text-neon-green' : 'text-gray-500'
                            }`}
                          >
                            {count}{total > 0 ? ` (${pct}%)` : ''}
                          </span>
                        </div>
                        <div className="w-full bg-white/5 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all duration-500 ${
                              isCorrect ? 'bg-neon-green/60' : 'bg-red-500/40'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
