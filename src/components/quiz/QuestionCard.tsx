import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, ChevronDown, ChevronUp, Check, ImageIcon, X, Loader2 } from 'lucide-react';
import { useState, useRef } from 'react';
import { apiFetch, apiFetchFormData } from '../../lib/api';

export interface QuestionData {
  id: string;
  text: string;
  options: string[];
  correct_index: number;
  time_limit_sec: 10 | 20 | 30;
  point_multiplier: 1 | 2;
  order_index: number;
  image_url?: string | null;
}

interface Props {
  question: QuestionData;
  index: number;
  onUpdate: (id: string, updates: Partial<QuestionData>) => void;
  onDelete: (id: string) => void;
}

const OPTION_COLORS = [
  'bg-red-500/20 border-red-500/50',
  'bg-blue-500/20 border-blue-500/50',
  'bg-yellow-500/20 border-yellow-500/50',
  'bg-green-500/20 border-green-500/50',
];
const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export function QuestionCard({ question, index, onUpdate, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: question.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  async function handleFileSelect(file: File) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      setUploadError('Unsupported type. Use PNG, JPG, WebP, or GIF.');
      setUploadState('error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File too large — max 10 MB.');
      setUploadState('error');
      return;
    }
    setUploadState('uploading');
    setUploadError(null);
    const form = new FormData();
    form.append('file', file);
    form.append('questionId', question.id);
    const res = await apiFetchFormData('/api/upload/question-image', form);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setUploadError(body.error || 'Upload failed.');
      setUploadState('error');
      return;
    }
    const { url } = await res.json();
    onUpdate(question.id, { image_url: url });
    setUploadState('idle');
  }

  async function handleDeleteImage() {
    const url = question.image_url;
    if (!url) return;
    onUpdate(question.id, { image_url: null });
    await apiFetch('/api/upload/question-image', {
      method: 'DELETE',
      body: JSON.stringify({ url }),
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }

  return (
    <div ref={setNodeRef} style={style} className="glass rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-500 hover:text-white p-1 touch-none"
        >
          <GripVertical className="w-5 h-5" />
        </button>
        <span className="text-sm font-mono text-gray-500 w-6 shrink-0">Q{index + 1}</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold truncate">
            {question.text || <span className="text-gray-500 italic font-normal">No question text</span>}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
            {question.time_limit_sec}s · {question.point_multiplier}× pts · {question.options.filter(Boolean).length} options
            {question.image_url && <><span>·</span><ImageIcon className="w-3 h-3 text-neon-blue" /></>}
          </p>
        </div>
        <button onClick={() => setExpanded((e) => !e)} className="p-2 glass rounded-xl hover:bg-white/10">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <button onClick={() => onDelete(question.id)} className="p-2 glass rounded-xl hover:bg-red-500/20">
          <Trash2 className="w-4 h-4 text-red-400" />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-white/10 p-4 space-y-4">
          {/* Image upload zone */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }}
          />

          {question.image_url ? (
            <div className="relative rounded-xl overflow-hidden" style={{ height: 160 }}>
              <img
                src={question.image_url}
                alt="Question image"
                className="w-full h-full object-cover"
              />
              <button
                onClick={handleDeleteImage}
                className="absolute top-2 right-2 p-1 rounded-full bg-black/60 hover:bg-red-500/80 transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          ) : uploadState === 'uploading' ? (
            <div className="flex items-center justify-center rounded-xl border border-white/10 bg-white/5" style={{ height: 100 }}>
              <Loader2 className="w-6 h-6 text-neon-blue animate-spin" />
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                dragOver ? 'border-neon-blue bg-neon-blue/10' : 'border-white/20 hover:border-white/40 bg-white/5'
              }`}
              style={{ height: 100 }}
            >
              <ImageIcon className="w-6 h-6 text-gray-500" />
              <span className="text-sm text-gray-400">Drop image or click to upload</span>
              <span className="text-xs text-gray-600">PNG, JPG, WebP, GIF · max 10 MB</span>
            </div>
          )}

          {uploadState === 'error' && uploadError && (
            <p className="text-xs text-red-400 -mt-2">{uploadError}</p>
          )}

          <textarea
            value={question.text}
            onChange={(e) => onUpdate(question.id, { text: e.target.value })}
            maxLength={280}
            rows={2}
            placeholder="Question text (max 280 characters)"
            className="w-full bg-white/5 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-neon-blue resize-none"
          />

          <div className="grid grid-cols-2 gap-3">
            {([0, 1, 2, 3] as const).map((i) => (
              <div key={i} className={`rounded-xl border p-3 ${OPTION_COLORS[i]}`}>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm w-5 shrink-0 text-gray-300">{OPTION_LABELS[i]}</span>
                  <input
                    value={question.options[i] ?? ''}
                    onChange={(e) => {
                      const opts = [...question.options];
                      opts[i] = e.target.value;
                      onUpdate(question.id, { options: opts });
                    }}
                    maxLength={120}
                    placeholder={`Option ${OPTION_LABELS[i]}`}
                    className="flex-1 bg-transparent outline-none text-sm placeholder-gray-500 min-w-0"
                  />
                  <button
                    onClick={() => onUpdate(question.id, { correct_index: i })}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      question.correct_index === i
                        ? 'bg-neon-green border-neon-green'
                        : 'border-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {question.correct_index === i && <Check className="w-3 h-3 text-black" />}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-6">
            <div>
              <label className="text-xs text-gray-400 block mb-2 uppercase tracking-widest">Time limit</label>
              <div className="flex gap-2">
                {([10, 20, 30] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => onUpdate(question.id, { time_limit_sec: t })}
                    className={`px-3 py-1 rounded-lg text-sm font-bold transition-colors ${
                      question.time_limit_sec === t ? 'bg-neon-blue text-black' : 'glass hover:bg-white/10'
                    }`}
                  >
                    {t}s
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-2 uppercase tracking-widest">Points</label>
              <div className="flex gap-2">
                {([1, 2] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => onUpdate(question.id, { point_multiplier: m })}
                    className={`px-3 py-1 rounded-lg text-sm font-bold transition-colors ${
                      question.point_multiplier === m ? 'bg-neon-purple text-white' : 'glass hover:bg-white/10'
                    }`}
                  >
                    {m}×
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
