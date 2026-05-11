# Quiz Preview Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen modal overlay to the quiz builder that lets a host step through their quiz as a simulated game view — one question at a time, with a "Reveal Answer" button that highlights the correct option.

**Architecture:** A new self-contained `QuizPreviewModal` component receives the already-loaded `QuestionData[]` from `QuizBuilderPage` — no extra API calls. The builder adds two state vars (`previewOpen`, `previewIndex`), a Preview button in its bottom toolbar, and renders the modal conditionally. The modal manages its own `index` and `revealed` state.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Lucide React (already installed)

---

## File Map

| Action | Path |
|--------|------|
| **Create** | `src/components/quiz/QuizPreviewModal.tsx` |
| **Modify** | `src/components/quiz/QuizBuilderPage.tsx` |

---

### Task 1: Create `QuizPreviewModal.tsx`

**Files:**
- Create: `src/components/quiz/QuizPreviewModal.tsx`

- [ ] **Step 1: Write the full component**

Create `src/components/quiz/QuizPreviewModal.tsx` with this complete implementation:

```tsx
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
```

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors. If TypeScript complains about `onClose` in the `useEffect` dependency array, that is expected — `onClose` is a stable prop reference coming from `useState` setters in the parent, so it's safe as-is.

- [ ] **Step 3: Commit**

```bash
git add src/components/quiz/QuizPreviewModal.tsx
git commit -m "feat: add QuizPreviewModal component"
```

---

### Task 2: Wire Preview button into `QuizBuilderPage`

**Files:**
- Modify: `src/components/quiz/QuizBuilderPage.tsx`

- [ ] **Step 1: Add imports at the top of `QuizBuilderPage.tsx`**

Find this import line (currently line 12):
```tsx
import { ArrowLeft, Plus, CheckCircle, Save, Upload } from 'lucide-react';
```

Replace with:
```tsx
import { ArrowLeft, Plus, CheckCircle, Save, Upload, Eye } from 'lucide-react';
import { QuizPreviewModal } from './QuizPreviewModal';
```

- [ ] **Step 2: Add `previewOpen` and `previewIndex` state**

Find this block (currently around line 33–38):
```tsx
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
```

Replace with:
```tsx
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const importRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 3: Add the Preview button to the fixed toolbar**

Find the fixed bottom bar (currently around line 216–245). It ends before the closing `</div>` of the fixed container. Add the Preview button as the first button in that row:

Find:
```tsx
      <div className="fixed bottom-8 left-0 right-0 flex justify-center gap-4 px-6">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={addQuestion}
```

Replace with:
```tsx
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
```

- [ ] **Step 4: Render the modal**

Find the closing `</div>` at the very bottom of the returned JSX (the last line before the final closing of `QuizBuilderPage`, currently around line 247):

```tsx
    </div>
  );
}
```

Replace with:
```tsx
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
```

- [ ] **Step 5: Type-check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Smoke test in the browser**

```bash
npm run dev
```

Open `http://localhost:3000`, log in, go to a quiz with at least 2 questions, open the quiz builder.

Verify:
1. **Preview button** appears in the bottom toolbar, styled in cyan
2. **Preview button is disabled** when there are 0 questions
3. Clicking **Preview** opens the modal overlay — builder is visible but darkened behind
4. **Frozen timer bar** shows at the top with "PREVIEW — TIMER PAUSED"
5. **Header** shows correct question counter and metadata
6. **X button** closes the modal
7. **Escape key** closes the modal
8. **Image** renders if the question has one; absent if not
9. **Answer tiles** show in red/blue/yellow/green
10. **Reveal Answer** highlights the correct tile green and dims the others
11. **Next →** advances to the next question and resets the revealed state
12. **Prev** navigates backwards and resets the revealed state
13. **ArrowRight** advances after reveal (keyboard shortcut)
14. On the last question, **Next → becomes "Finish"** and closes the modal

- [ ] **Step 7: Commit**

```bash
git add src/components/quiz/QuizBuilderPage.tsx
git commit -m "feat: wire quiz preview modal into builder toolbar"
```
