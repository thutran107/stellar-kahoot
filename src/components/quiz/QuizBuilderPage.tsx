import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, CheckCircle, Save, Upload, Eye } from 'lucide-react';
import { QuizPreviewModal } from './QuizPreviewModal';
import { apiFetch } from '../../lib/api';
import { QuestionCard, QuestionData } from './QuestionCard';

interface ImportedQuestion {
  question: string;
  answers: string[];
  correct_index: number;
}

interface Quiz {
  id: string;
  title: string;
  description: string | null;
  is_ready: boolean;
}

export function QuizBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const importRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => { if (id) loadQuiz(id); }, [id]);

  async function loadQuiz(quizId: string) {
    const res = await apiFetch(`/api/quizzes/${quizId}`);
    const data = await res.json();
    setQuiz(data);
    setTitleDraft(data.title);
    setQuestions(data.questions ?? []);
  }

  async function saveTitle() {
    if (!quiz || !titleDraft.trim()) return;
    setEditingTitle(false);
    await apiFetch(`/api/quizzes/${quiz.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: titleDraft }),
    });
    setQuiz((prev) => prev ? { ...prev, title: titleDraft } : prev);
  }

  async function addQuestion() {
    const res = await apiFetch(`/api/quizzes/${id}/questions`, {
      method: 'POST',
      body: JSON.stringify({
        text: '',
        options: ['', '', '', ''],
        correct_index: 0,
        time_limit_sec: 20,
        point_multiplier: 1,
        order_index: questions.length,
      }),
    });
    const created = await res.json();
    setQuestions((prev) => [...prev, created]);
  }

  const updateQuestion = useCallback(async (qId: string, updates: Partial<QuestionData>) => {
    setQuestions((prev) => prev.map((q) => (q.id === qId ? { ...q, ...updates } : q)));
    setSaving(true);
    await apiFetch(`/api/quizzes/questions/${qId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    setSaving(false);
  }, []);

  async function deleteQuestion(qId: string) {
    await apiFetch(`/api/quizzes/questions/${qId}`, { method: 'DELETE' });
    setQuestions((prev) => prev.filter((q) => q.id !== qId));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = questions.findIndex((q) => q.id === active.id);
    const newIdx = questions.findIndex((q) => q.id === over.id);
    const reordered = arrayMove(questions, oldIdx, newIdx).map((q, i) => ({ ...q, order_index: i }));
    setQuestions(reordered);
    await apiFetch(`/api/quizzes/${id}/questions/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ orderedIds: reordered.map((q) => q.id) }),
    });
  }

  async function importJSON(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    let parsed: ImportedQuestion[];
    try {
      parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) throw new Error('Expected an array');
    } catch {
      alert('Invalid JSON file — expected an array of questions.');
      return;
    }

    setImporting(true);
    const startIndex = questions.length;
    const created = await Promise.all(
      parsed.map((q, i) =>
        apiFetch(`/api/quizzes/${id}/questions`, {
          method: 'POST',
          body: JSON.stringify({
            text: q.question,
            options: q.answers,
            correct_index: q.correct_index,
            time_limit_sec: 20,
            point_multiplier: 1,
            order_index: startIndex + i,
          }),
        }).then((r) => r.json())
      )
    );
    setQuestions((prev) => [...prev, ...created]);
    setImporting(false);
  }

  async function toggleReady() {
    if (!quiz) return;
    const is_ready = !quiz.is_ready;
    await apiFetch(`/api/quizzes/${quiz.id}`, { method: 'PATCH', body: JSON.stringify({ is_ready }) });
    setQuiz((prev) => prev ? { ...prev, is_ready } : prev);
  }

  if (!quiz) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading quiz...</div>;
  }

  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto pb-28">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/quizzes')} className="p-2 glass rounded-xl hover:bg-white/10">
          <ArrowLeft className="w-5 h-5" />
        </button>
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
            className="flex-1 bg-transparent text-3xl font-black outline-none border-b-2 border-neon-blue pb-1"
          />
        ) : (
          <h1
            className="text-3xl font-black cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => setEditingTitle(true)}
            title="Click to rename"
          >
            {quiz.title}
          </h1>
        )}
        {saving && (
          <span className="text-xs text-gray-500 flex items-center gap-1 shrink-0">
            <Save className="w-3 h-3" /> Saving...
          </span>
        )}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {questions.map((q, i) => (
              <QuestionCard
                key={q.id}
                question={q}
                index={i}
                onUpdate={updateQuestion}
                onDelete={deleteQuestion}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {questions.length === 0 && (
        <div className="text-center text-gray-500 py-16">
          No questions yet — add your first one below.
        </div>
      )}

      <input
        ref={importRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={importJSON}
      />

      <div className="fixed bottom-8 left-0 right-0 flex justify-center gap-4 px-6">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => { setPreviewIndex(0); setPreviewOpen(true); }}
          disabled={questions.length === 0}
          className="px-6 py-3 rounded-xl font-bold flex items-center gap-2 glass border border-cyan-400/50 text-cyan-300 hover:border-cyan-400 shadow-xl disabled:opacity-50"
        >
          <Eye className="w-5 h-5" /> Preview
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={addQuestion}
          className="btn-funky px-6 py-3 rounded-xl text-white font-bold flex items-center gap-2 shadow-xl"
        >
          <Plus className="w-5 h-5" /> Add Question
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => importRef.current?.click()}
          disabled={importing}
          className="px-6 py-3 rounded-xl font-bold flex items-center gap-2 glass border border-indigo-400/50 text-indigo-300 hover:border-indigo-400 shadow-xl disabled:opacity-50"
        >
          <Upload className="w-5 h-5" />
          {importing ? 'Importing...' : 'Import JSON'}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={toggleReady}
          title={quiz.is_ready ? 'Click to unpublish' : 'Publish this quiz'}
          className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 glass border shadow-xl ${
            quiz.is_ready
              ? 'border-neon-green text-neon-green'
              : 'border-gray-500 text-gray-300 hover:border-gray-300'
          }`}
        >
          <CheckCircle className="w-5 h-5" />
          {quiz.is_ready ? 'Published' : 'Publish'}
        </motion.button>
      </div>
      {previewOpen && (
        <QuizPreviewModal
          questions={questions}
          initialIndex={previewIndex}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
