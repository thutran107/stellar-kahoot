import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Play, Edit2, Copy, Trash2, CheckCircle, Clock, LogOut, History, Link } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { apiFetch } from '../../lib/api';

interface Quiz {
  id: string;
  title: string;
  description: string | null;
  is_ready: boolean;
  created_at: string;
}

export function QuizListPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuthStore();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyHostLink(id: string) {
    const url = `${window.location.origin}/host?quizId=${id}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const res = await apiFetch('/api/quizzes');
    setQuizzes(await res.json());
    setLoading(false);
  }

  async function createQuiz(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const res = await apiFetch('/api/quizzes', {
      method: 'POST',
      body: JSON.stringify({ title: newTitle }),
    });
    const quiz = await res.json();
    setCreating(false);
    setNewTitle('');
    navigate(`/quizzes/${quiz.id}/edit`);
  }

  async function duplicate(id: string) {
    await apiFetch(`/api/quizzes/${id}/duplicate`, { method: 'POST' });
    load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this quiz?')) return;
    await apiFetch(`/api/quizzes/${id}`, { method: 'DELETE' });
    setQuizzes((prev) => prev.filter((q) => q.id !== id));
  }

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8 gap-6">
        <div className="min-w-0">
          <h1 className="text-4xl font-black tracking-tighter truncate">Mission Control</h1>
          <p className="text-gray-400 text-sm mt-1">{user?.email}</p>
        </div>
        <div className="flex gap-3 shrink-0">
          <button
            onClick={() => setCreating(true)}
            className="py-2 px-4 text-white font-bold rounded-xl flex items-center gap-2 btn-funky"
          >
            <Plus className="w-4 h-4" /> New Quiz
          </button>
          <button
            onClick={() => navigate('/games')}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors px-3 py-2 glass rounded-lg"
          >
            <History className="w-4 h-4" /> Past Games
          </button>
          <button onClick={signOut} className="p-2 glass rounded-xl hover:bg-white/10" title="Sign out">
            <LogOut className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {creating && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={createQuiz}
            className="glass p-4 rounded-2xl mb-6 flex gap-3 overflow-hidden"
          >
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Quiz title..."
              className="flex-1 bg-transparent outline-none text-lg font-bold placeholder-gray-500"
            />
            <button type="submit" className="btn-funky px-4 py-2 rounded-xl text-white font-bold text-sm">
              Create
            </button>
            <button type="button" onClick={() => setCreating(false)} className="px-4 py-2 glass rounded-xl text-gray-400 text-sm">
              Cancel
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="text-center text-gray-500 py-16 font-mono">Loading quizzes...</div>
      ) : quizzes.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-xl text-gray-500 mb-4">No quizzes yet</p>
          <button onClick={() => setCreating(true)} className="btn-funky px-6 py-3 rounded-xl text-white font-bold">
            Create your first quiz
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence>
            {quizzes.map((quiz) => (
              <motion.div
                key={quiz.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="glass p-5 rounded-2xl flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-xl font-bold truncate">{quiz.title}</h3>
                    {quiz.is_ready ? (
                      <span className="flex items-center gap-1 text-xs text-neon-green bg-neon-green/10 px-2 py-0.5 rounded-full shrink-0">
                        <CheckCircle className="w-3 h-3" /> Ready
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-gray-400 bg-white/5 px-2 py-0.5 rounded-full shrink-0">
                        <Clock className="w-3 h-3" /> Draft
                      </span>
                    )}
                  </div>
                  {quiz.description && (
                    <p className="text-gray-400 text-sm truncate">{quiz.description}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => navigate(`/host?quizId=${quiz.id}`)}
                    className="btn-funky p-2 rounded-xl"
                    title="Host game"
                  >
                    <Play className="w-4 h-4 text-white" />
                  </button>
                  {quiz.is_ready && (
                    <button
                      onClick={() => copyHostLink(quiz.id)}
                      className="p-2 glass rounded-xl hover:bg-white/10 relative"
                      title="Copy host link"
                    >
                      <Link className="w-4 h-4 text-neon-green" />
                      {copiedId === quiz.id && (
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs bg-black/80 text-neon-green px-2 py-1 rounded whitespace-nowrap">
                          Copied!
                        </span>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => navigate(`/quizzes/${quiz.id}/edit`)}
                    className="p-2 glass rounded-xl hover:bg-white/10"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4 text-gray-300" />
                  </button>
                  <button
                    onClick={() => duplicate(quiz.id)}
                    className="p-2 glass rounded-xl hover:bg-white/10"
                    title="Duplicate"
                  >
                    <Copy className="w-4 h-4 text-gray-300" />
                  </button>
                  <button
                    onClick={() => remove(quiz.id)}
                    className="p-2 glass rounded-xl hover:bg-red-500/20"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
