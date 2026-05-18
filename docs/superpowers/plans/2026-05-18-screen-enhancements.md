# Screen Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a numeric countdown timer to both the host and player views, a Kahoot-style full-width progress bar to the player view, and a Big Screen Mode to the host view that scales the UI for TV/projector projection.

**Architecture:** Five files change. `CountdownTimer` and `PlayerProgressBar` are standalone components that drive themselves via `requestAnimationFrame` using `questionStartTime` and `question.timeLimit` passed as props — both already in the Zustand store. Big Screen Mode is a single `.big-screen` CSS class on the `HostView` root `div`; all visual overrides live in `index.css` scoped to that class — no prop drilling, no conditional rendering beyond the toggle button.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, `requestAnimationFrame` for smooth animation (same pattern as the existing `TimerBar` in both view files).

---

## File Map

| File | Role |
|---|---|
| `src/components/CountdownTimer.tsx` | New — shared numeric countdown pill; `led-digit countdown-digit` classes activate big-screen CSS |
| `src/components/PlayerProgressBar.tsx` | New — full-width depleting bar for player view only |
| `src/index.css` | Add `.big-screen`-scoped rules: font sizes in `vw`, LED glow, TimerBar height override |
| `src/components/HostView.tsx` | `bigScreen` state + toggle button; `.big-screen` on root; class names on question text, answer options, status rows, scores; render `CountdownTimer` |
| `src/components/PlayerView.tsx` | Render `CountdownTimer` above answers, `PlayerProgressBar` below answers |

No changes to: `server.ts`, `store.ts`, `App.tsx`, or any auth/routing files.

---

### Task 1: CountdownTimer component

**Files:**
- Create: `src/components/CountdownTimer.tsx`

- [ ] **Step 1: Create `src/components/CountdownTimer.tsx`**

```tsx
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
```

**Key notes:**
- `led-digit countdown-digit` classes are always on the element. They have no effect until a `.big-screen` ancestor is present (CSS rules in Task 3 activate them).
- `Math.ceil` keeps the display at `1s` until the last millisecond, matching Kahoot-style behaviour.
- Guard `if (!startTime || !timeLimit) return null` satisfies the spec error case for unstarted questions.

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/CountdownTimer.tsx
git commit -m "feat: add CountdownTimer shared component"
```

---

### Task 2: PlayerProgressBar component

**Files:**
- Create: `src/components/PlayerProgressBar.tsx`

- [ ] **Step 1: Create `src/components/PlayerProgressBar.tsx`**

```tsx
import { useState, useEffect } from 'react';

interface PlayerProgressBarProps {
  startTime: number;
  timeLimit: number;
}

export function PlayerProgressBar({ startTime, timeLimit }: PlayerProgressBarProps) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!startTime || !timeLimit) return;
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
          transition: 'width 0.1s linear, background-color 0.3s ease',
        }}
      />
    </div>
  );
}
```

**Key notes:**
- Visually distinct from the existing host `TimerBar`: this is `h-3` (12px), in normal document flow, with `my-4` margins. The host `TimerBar` is `h-2` (2px) and `absolute top-0`.
- No `.big-screen` interaction — this component lives only in `PlayerView`, which never has a `.big-screen` ancestor.

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/PlayerProgressBar.tsx
git commit -m "feat: add PlayerProgressBar component"
```

---

### Task 3: Big-screen CSS

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Append big-screen rules to the end of `src/index.css`**

The file currently ends after the `.btn-funky:active` block. Append:

```css
/* Big Screen Mode — all rules scoped to .big-screen on the HostView root */

.big-screen .question-text {
  font-size: 5vw;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
}

.big-screen .answer-option {
  font-size: 2.5vw;
}

.big-screen .player-status {
  font-size: 1.5vw;
}

.big-screen .vote-count {
  font-size: 2vw;
}

.big-screen .led-digit {
  font-family: 'JetBrains Mono', 'Courier New', Courier, monospace;
  text-shadow:
    0 0 7px currentColor,
    0 0 10px currentColor,
    0 0 21px currentColor,
    0 0 42px currentColor;
}

.big-screen .countdown-digit {
  font-size: 8vw;
}

.big-screen .leaderboard-score {
  font-size: 3vw;
}

.big-screen .timer-bar {
  height: 1vh;
}
```

**Key notes:**
- `.led-digit` applies font-family + glow only; size is controlled separately by `.countdown-digit` (8vw) and `.leaderboard-score` (3vw) because they're different elements.
- `.timer-bar` override bumps the existing host `TimerBar` from `h-2` (2px) to `1vh` so it remains visible on 4K screens. `PlayerProgressBar` is never inside `.big-screen` so it is unaffected.
- JetBrains Mono is already loaded via Google Fonts CDN (`display=swap`). `'Courier New', Courier, monospace` is the fallback stack.

- [ ] **Step 2: Type-check**

```bash
npm run lint
```

Expected: no errors (CSS changes don't affect TypeScript)

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat: add big-screen scoped CSS rules"
```

---

### Task 4: HostView changes

**Files:**
- Modify: `src/components/HostView.tsx`

This task touches five distinct areas of the file. Make each edit carefully.

- [ ] **Step 1: Add import for CountdownTimer**

At line 1 of `src/components/HostView.tsx`, after the existing import block, add:

```tsx
import { CountdownTimer } from './CountdownTimer';
```

- [ ] **Step 2: Add `timer-bar` class to `TimerBar`'s outer div**

In the `TimerBar` function (lines 9–44), the outer `div` is:

```tsx
<div className="w-full bg-white/5 h-2 absolute top-0 left-0 z-50">
```

Change it to:

```tsx
<div className="timer-bar w-full bg-white/5 h-2 absolute top-0 left-0 z-50">
```

This lets `.big-screen .timer-bar { height: 1vh }` from Task 3 activate on this element.

- [ ] **Step 3: Add `bigScreen` state and wire `.big-screen` to root div**

After line 50 (`const [pendingQuestions, setPendingQuestions] = useState<Question[] | null>(null);`), add:

```tsx
const [bigScreen, setBigScreen] = useState(false);
```

Change the root `div` (line 107):

```tsx
<div className="min-h-screen flex flex-col p-4 md:p-8 relative">
```

to:

```tsx
<div className={`min-h-screen flex flex-col p-4 md:p-8 relative${bigScreen ? ' big-screen' : ''}`}>
```

- [ ] **Step 4: Add Big Screen toggle button in the lobby panel**

In the lobby section, the header row with `<h3>Crew Members</h3>` and the Launch Mission button (around lines 133–145) currently is:

```tsx
<div className="flex items-center justify-between mb-6 pb-4">
  <h3 className="text-3xl font-bold flex items-center gap-3">
    <Users className="text-neon-pink" /> 
    Crew Members <span className="text-neon-pink">({players.length})</span>
  </h3>
  
  <button 
    onClick={startGame}
    disabled={players.length === 0}
    className="py-3 px-8 text-white font-bold rounded-xl text-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed btn-funky"
  >
    <Play className="w-5 h-5" /> Launch Mission
  </button>
</div>
```

Replace it with:

```tsx
<div className="flex items-center justify-between mb-6 pb-4">
  <h3 className="text-3xl font-bold flex items-center gap-3">
    <Users className="text-neon-pink" /> 
    Crew Members <span className="text-neon-pink">({players.length})</span>
  </h3>
  
  <div className="flex items-center gap-4">
    <button
      onClick={() => setBigScreen(b => !b)}
      className={`py-2 px-5 rounded-xl text-sm font-mono uppercase tracking-widest border transition-colors ${
        bigScreen
          ? 'border-neon-blue text-neon-blue bg-neon-blue/10'
          : 'border-white/20 text-gray-400 hover:border-white/40'
      }`}
    >
      {bigScreen ? 'Exit Big Screen' : 'Big Screen Mode'}
    </button>

    <button 
      onClick={startGame}
      disabled={players.length === 0}
      className="py-3 px-8 text-white font-bold rounded-xl text-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed btn-funky"
    >
      <Play className="w-5 h-5" /> Launch Mission
    </button>
  </div>
</div>
```

The toggle is inside `{gameState === 'LOBBY' && (...)}` so it disappears automatically once the game starts — conditional rendering via the parent block.

- [ ] **Step 5: Add class names and CountdownTimer in the QUESTION_ACTIVE section**

Replace the header row in QUESTION_ACTIVE (lines 178–185):

```tsx
<div className="flex justify-between items-center mb-12">
  <div className="text-2xl font-mono text-gray-400">
    Question {currentQuestionIndex + 1} <span className="text-gray-600">/ {totalQuestions}</span>
  </div>
  <div className="text-2xl font-mono flex items-center gap-2 text-neon-blue bg-neon-blue/10 px-4 py-2 rounded-lg border border-neon-blue/30">
    <Users className="w-5 h-5" />
    {players.filter(p => p.hasAnswered).length} / {players.length} Answers
  </div>
</div>
```

with:

```tsx
<div className="flex justify-between items-center mb-12">
  <div className="player-status text-2xl font-mono text-gray-400">
    Question {currentQuestionIndex + 1} <span className="text-gray-600">/ {totalQuestions}</span>
  </div>
  <CountdownTimer startTime={questionStartTime} timeLimit={question.timeLimit} />
  <div className="player-status text-2xl font-mono flex items-center gap-2 text-neon-blue bg-neon-blue/10 px-4 py-2 rounded-lg border border-neon-blue/30">
    <Users className="w-5 h-5" />
    {players.filter(p => p.hasAnswered).length} / {players.length} Answers
  </div>
</div>
```

Add `question-text` to the question `h2` (line 198):

```tsx
<h2 className="question-text text-5xl md:text-6xl font-light italic text-center mb-16 leading-tight">
  {question.text}
</h2>
```

Add `answer-option` to each answer option `div` (line 204 — the `key={i}` div):

```tsx
<div key={i} className={`answer-option glass p-8 rounded-[2rem] text-2xl text-center font-bold relative overflow-hidden focus:outline-none transition-transform hover:scale-[1.02] 
  ${i === 0 ? 'border-l-4 border-l-red-500 hover:shadow-[0_0_15px_rgba(239,68,68,0.2)]' : ''}
  ${i === 1 ? 'border-l-4 border-l-blue-500 hover:shadow-[0_0_15px_rgba(59,130,246,0.2)]' : ''}
  ${i === 2 ? 'border-l-4 border-l-yellow-500 hover:shadow-[0_0_15px_rgba(234,179,8,0.2)]' : ''}
  ${i === 3 ? 'border-l-4 border-l-green-500 hover:shadow-[0_0_15px_rgba(34,197,94,0.2)]' : ''}
`}>
```

- [ ] **Step 6: Add `vote-count` in QUESTION_RESULTS and `led-digit leaderboard-score` in FINAL_LEADERBOARD**

In the `QUESTION_RESULTS` vote tally (around line 265), the count span is:

```tsx
<span className="font-mono text-lg">
  {count}{total > 0 ? ` (${pct}%)` : ''}
</span>
```

Change to:

```tsx
<span className="vote-count font-mono text-lg">
  {count}{total > 0 ? ` (${pct}%)` : ''}
</span>
```

In the `players.slice(3)` list in `FINAL_LEADERBOARD` (around line 325), the score span is:

```tsx
<span className="font-mono text-neon-blue font-bold">{p.score} pts</span>
```

Change to:

```tsx
<span className="led-digit leaderboard-score font-mono text-neon-blue font-bold">{p.score} pts</span>
```

In the `LeaderboardPodium` helper function (around line 373), the score span is:

```tsx
<span className="font-mono text-sm mt-1 bg-black/50 px-2 py-0.5 rounded text-gray-300 z-10">{player.score}</span>
```

Change to:

```tsx
<span className="led-digit leaderboard-score font-mono text-sm mt-1 bg-black/50 px-2 py-0.5 rounded text-gray-300 z-10">{player.score}</span>
```

- [ ] **Step 7: Type-check**

```bash
npm run lint
```

Expected: no type errors

- [ ] **Step 8: Commit**

```bash
git add src/components/HostView.tsx
git commit -m "feat: add big screen mode and countdown timer to host view"
```

---

### Task 5: PlayerView changes

**Files:**
- Modify: `src/components/PlayerView.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/components/PlayerView.tsx`, after the existing imports, add:

```tsx
import { CountdownTimer } from './CountdownTimer';
import { PlayerProgressBar } from './PlayerProgressBar';
```

- [ ] **Step 2: Add CountdownTimer above and PlayerProgressBar below the answer grid**

The `QUESTION_ACTIVE` answering block (lines 246–274) currently is:

```tsx
{gameState === 'QUESTION_ACTIVE' && question && answerFeedback === null && (
  <div className="flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full h-full">
    <h3 className="text-center text-gray-400 font-bold mb-8 tracking-widest">SELECT YOUR ANSWER</h3>
    <div className="grid grid-cols-2 gap-4 h-[60vh]">
      {question.options.map((_, i) => (
        <motion.button
          whileTap={{ scale: 0.95 }}
          key={i}
          onClick={() => submitAnswer(i)}
          className={`rounded-[2rem] glass flex items-center justify-center border-b-4 hover:brightness-110 active:border-b-0 active:translate-y-1 transition-all
            ${i === 0 ? 'bg-red-500/20 border-red-500 hover:bg-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : ''}
            ${i === 1 ? 'bg-blue-500/20 border-blue-500 hover:bg-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : ''}
            ${i === 2 ? 'bg-yellow-500/20 border-yellow-500 hover:bg-yellow-500/30 shadow-[0_0_15px_rgba(234,179,8,0.2)]' : ''}
            ${i === 3 ? 'bg-green-500/20 border-green-500 hover:bg-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.2)]' : ''}
          `}
        >
          <div className={`w-16 h-16 rounded-full flex items-center justify-center border-2 
            ${i === 0 ? 'border-red-500 bg-red-900/50 text-white' : ''}
            ${i === 1 ? 'border-blue-500 bg-blue-900/50 text-white' : ''}
            ${i === 2 ? 'border-yellow-500 bg-yellow-900/50 text-white' : ''}
            ${i === 3 ? 'border-green-500 bg-green-900/50 text-white' : ''}
          `}>
             <span className="font-black text-xl">{i + 1}</span>
          </div>
        </motion.button>
      ))}
    </div>
  </div>
)}
```

Replace with:

```tsx
{gameState === 'QUESTION_ACTIVE' && question && answerFeedback === null && (
  <div className="flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full h-full">
    <div className="flex justify-center mb-4">
      <CountdownTimer startTime={questionStartTime} timeLimit={question.timeLimit} />
    </div>
    <h3 className="text-center text-gray-400 font-bold mb-8 tracking-widest">SELECT YOUR ANSWER</h3>
    <div className="grid grid-cols-2 gap-4 h-[60vh]">
      {question.options.map((_, i) => (
        <motion.button
          whileTap={{ scale: 0.95 }}
          key={i}
          onClick={() => submitAnswer(i)}
          className={`rounded-[2rem] glass flex items-center justify-center border-b-4 hover:brightness-110 active:border-b-0 active:translate-y-1 transition-all
            ${i === 0 ? 'bg-red-500/20 border-red-500 hover:bg-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : ''}
            ${i === 1 ? 'bg-blue-500/20 border-blue-500 hover:bg-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : ''}
            ${i === 2 ? 'bg-yellow-500/20 border-yellow-500 hover:bg-yellow-500/30 shadow-[0_0_15px_rgba(234,179,8,0.2)]' : ''}
            ${i === 3 ? 'bg-green-500/20 border-green-500 hover:bg-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.2)]' : ''}
          `}
        >
          <div className={`w-16 h-16 rounded-full flex items-center justify-center border-2 
            ${i === 0 ? 'border-red-500 bg-red-900/50 text-white' : ''}
            ${i === 1 ? 'border-blue-500 bg-blue-900/50 text-white' : ''}
            ${i === 2 ? 'border-yellow-500 bg-yellow-900/50 text-white' : ''}
            ${i === 3 ? 'border-green-500 bg-green-900/50 text-white' : ''}
          `}>
             <span className="font-black text-xl">{i + 1}</span>
          </div>
        </motion.button>
      ))}
    </div>
    <PlayerProgressBar startTime={questionStartTime} timeLimit={question.timeLimit} />
  </div>
)}
```

- [ ] **Step 3: Type-check**

```bash
npm run lint
```

Expected: no type errors

- [ ] **Step 4: Commit**

```bash
git add src/components/PlayerView.tsx
git commit -m "feat: add countdown timer and progress bar to player view"
```

---

## Manual Smoke Test

After all tasks are committed, start the dev server and verify:

```bash
npm run dev
```

1. Open `http://localhost:3000/host?quizId=<any>` in one tab and `http://localhost:3000/join` in another.
2. **Normal mode — lobby:** Toggle button "Big Screen Mode" is visible; clicking it activates/deactivates; PIN and player list layout unchanged.
3. **Normal mode — question active:** CountdownTimer pill appears (cyan → rose at ~30%), existing `TimerBar` still runs across the top.
4. **Normal mode — player view:** CountdownTimer pill appears above answers; progress bar depletes below the answer grid; both hold at 0/empty when server ends the question.
5. **Big Screen Mode — activate in lobby:** Toggle button shows active state. Click "Launch Mission".
6. **Big Screen Mode — question active:** Question text fills ~5vw, answer labels scale to ~2.5vw, CountdownTimer shows large LED digits at ~8vw with glow, `TimerBar` is visibly taller.
7. **Big Screen Mode — final leaderboard:** Score numbers show LED glow.
8. **Big Screen Mode — toggle unavailable mid-game:** Button is gone once game starts.
