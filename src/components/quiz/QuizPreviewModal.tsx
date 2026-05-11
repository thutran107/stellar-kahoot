import { useEffect, useState } from 'react';
import { X, ChevronLeft } from 'lucide-react';
import { QuestionData } from './QuestionCard';

interface Props {
  questions: QuestionData[];
  initialIndex: number;
  onClose: () => void;
}

const OPTION_BG = [
  'bg-red-500/20',
  'bg-blue-500/20',
  'bg-yellow-500/20',
  'bg-green-500/20',
];
const OPTION_BORDER = [
  'border-l-red-500',
  'border-l-blue-500',
  'border-l-yellow-500',
  'border-l-green-500',
];
const BADGE_BG = [
  'bg-red-500',
  'bg-blue-500',
  'bg-yellow-500',
  'bg-green-500',
];

export function QuizPreviewModal({ questions, initialIndex, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [revealed, setRevealed] = useState(false);

  const question = questions[index];
  const isLast = index === questions.length - 1;
  const isFirst = index === 0;

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' && revealed) {
        if (isLast) {
          onClose();
        } else {
          setIndex((i) => i + 1);
          setRevealed(false);
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [revealed, isLast, onClose]);

  function advance() {
    if (isLast) {
      onClose();
    } else {
      setIndex((i) => i + 1);
      setRevealed(false);
    }
  }

  function goBack() {
    setIndex((i) => i - 1);
    setRevealed(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-[#12122a] border border-indigo-500/30 rounded-3xl overflow-hidden flex flex-col max-h-[92vh] shadow-2xl">

        {/* Frozen timer bar */}
        <div className="relative h-1 bg-gradient-to-r from-cyan-400 to-indigo-500 shrink-0">
          <span className="absolute right-3 top-2 text-[9px] uppercase tracking-widest text-indigo-400/60 font-mono">
            Preview — Timer Paused
          </span>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <span className="font-mono text-sm text-gray-400">
            Question{' '}
            <span className="text-indigo-300 font-bold">{index + 1}</span>
            {' '}of {questions.length}
            {' · '}{question.time_limit_sec}s
            {' · '}{question.point_multiplier}× pts
          </span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-8 py-6 flex flex-col gap-6">
          {question.image_url && (
            <div
              className="w-full rounded-2xl overflow-hidden bg-black/30 flex items-center justify-center"
              style={{ maxHeight: 200 }}
            >
              <img
                src={question.image_url}
                alt=""
                className="object-contain"
                style={{ maxHeight: 200, maxWidth: '100%' }}
              />
            </div>
          )}

          <h2 className="text-4xl font-light italic text-center leading-tight">
            {question.text || (
              <span className="text-gray-500">No question text</span>
            )}
          </h2>

          <div className="grid grid-cols-2 gap-4">
            {question.options.map((opt, i) => {
              const isCorrect = i === question.correct_index;
              const isWrong = revealed && !isCorrect;
              return (
                <div
                  key={i}
                  className={`
                    relative rounded-[1.5rem] p-6 pl-14 font-bold text-lg border-l-4 transition-all duration-300
                    ${revealed && isCorrect
                      ? 'bg-neon-green/20 border-neon-green text-neon-green shadow-[0_0_15px_rgba(52,211,153,0.3)]'
                      : `${OPTION_BG[i]} ${OPTION_BORDER[i]}`
                    }
                    ${isWrong ? 'opacity-35' : ''}
                  `}
                >
                  <div
                    className={`absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center font-black text-white text-sm
                      ${revealed && isCorrect ? 'bg-neon-green' : BADGE_BG[i]}
                    `}
                  >
                    {i + 1}
                  </div>
                  {opt || (
                    <span className="text-gray-500 italic font-normal">Empty option</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-8 py-5 border-t border-white/10 shrink-0">
          <button
            onClick={goBack}
            disabled={isFirst}
            className="flex items-center gap-1 px-5 py-2.5 rounded-xl glass border border-white/10 font-bold text-sm text-gray-300 hover:bg-white/10 disabled:opacity-25 disabled:cursor-default transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>

          {!revealed ? (
            <button
              onClick={() => setRevealed(true)}
              className="px-8 py-3 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-indigo-500 to-purple-500 shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:opacity-85 transition-opacity"
            >
              Reveal Answer
            </button>
          ) : (
            <button
              onClick={advance}
              className="px-8 py-3 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-cyan-400 to-indigo-500 shadow-[0_0_20px_rgba(34,211,238,0.3)] hover:opacity-85 transition-opacity"
            >
              {isLast ? 'Finish' : 'Next →'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
