# Leaderboard Per Question Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a rank-delta leaderboard by default on the host's QUESTION_RESULTS screen after every question, with a "view answers" link to toggle to the existing answer distribution.

**Architecture:** Single file change — `src/components/HostView.tsx`. Add `showAnswers` boolean state (default `false`) that resets on every `gameState` change. Rank deltas are derived client-side from the existing `scoreHistory` field on each player; no server changes needed. The existing answer distribution JSX is left intact and conditionally shown when `showAnswers` is `true`.

**Tech Stack:** React 19 (useState, useEffect), TypeScript, Tailwind CSS v4

---

### Task 1: Add `showAnswers` state and reset effect

**Files:**
- Modify: `src/components/HostView.tsx:54` (add state declaration)
- Modify: `src/components/HostView.tsx:89-91` (add reset useEffect alongside existing one)

- [ ] **Step 1: Add the `showAnswers` state variable**

In `src/components/HostView.tsx`, after line 54 (`const [showBreakdown, setShowBreakdown] = useState(false);`), add:

```ts
const [showAnswers, setShowAnswers] = useState(false);
```

The two state declarations should now read:

```ts
const [showBreakdown, setShowBreakdown] = useState(false);
const [showAnswers, setShowAnswers] = useState(false);
```

- [ ] **Step 2: Add a reset useEffect**

After the existing `useEffect` at lines 89-91:

```ts
useEffect(() => {
  if (gameState === 'LOBBY') setShowBreakdown(false);
}, [gameState]);
```

Add a new `useEffect` directly below it:

```ts
useEffect(() => {
  setShowAnswers(false);
}, [gameState]);
```

This resets to leaderboard view every time the game transitions to a new state (including each new `QUESTION_RESULTS`).

- [ ] **Step 3: Verify types**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/HostView.tsx
git commit -m "feat: add showAnswers state for per-question leaderboard toggle"
```

---

### Task 2: Update the QUESTION_RESULTS action bar

**Files:**
- Modify: `src/components/HostView.tsx:323-330` (expand fixed action bar to include toggle link)

The current action bar (lines 323-330) is:
```tsx
<div className="flex justify-end gap-4 p-4 glass fixed bottom-8 right-8 z-10 rounded-3xl">
   <button 
    onClick={nextQuestion}
    className="py-4 px-8 text-white font-black rounded-[2rem] text-lg flex items-center gap-2 uppercase tracking-tighter btn-funky"
  >
    <Play className="w-5 h-5" /> Next
  </button>
</div>
```

- [ ] **Step 1: Replace the action bar with a two-sided layout**

Replace the entire block above with:

```tsx
<div className="flex items-center justify-between gap-6 p-4 glass fixed bottom-8 right-8 z-10 rounded-3xl">
  <button
    onClick={() => setShowAnswers(v => !v)}
    className="text-gray-500 font-mono text-sm underline underline-offset-2 hover:text-gray-300 transition-colors"
  >
    {showAnswers ? 'hide answers' : 'view answers'}
  </button>
  <button
    onClick={nextQuestion}
    className="py-4 px-8 text-white font-black rounded-[2rem] text-lg flex items-center gap-2 uppercase tracking-tighter btn-funky"
  >
    <Play className="w-5 h-5" /> Next
  </button>
</div>
```

- [ ] **Step 2: Verify types**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/HostView.tsx
git commit -m "feat: add view answers toggle to question results action bar"
```

---

### Task 3: Add rank-delta helpers and leaderboard card

**Files:**
- Modify: `src/components/HostView.tsx:113-115` (add rank-delta helpers before `return (`)
- Modify: `src/components/HostView.tsx:276-321` (replace answer distribution with conditional rendering)

- [ ] **Step 1: Add rank-delta helpers before `return (`**

In `src/components/HostView.tsx`, just before `return (` at line 115, insert:

```ts
const prevScore = (p: Player) => p.score - (p.scoreHistory.at(-1) ?? 0);
const prevRanking = [...players].sort((a, b) => prevScore(b) - prevScore(a));
const prevRankMap = new Map(prevRanking.map((p, i) => [p.id, i]));
const rankDelta = (p: Player, idx: number): 'up' | 'down' | 'same' => {
  const prev = prevRankMap.get(p.id) ?? idx;
  if (idx < prev) return 'up';
  if (idx > prev) return 'down';
  return 'same';
};
```

These run on every render; they're cheap O(n log n) sorts over a small array (max ~30 players).

- [ ] **Step 2: Replace the answer distribution block with conditional rendering**

The current answer distribution block (lines 276-321) is the single `<div className="glass p-8 rounded-3xl mb-12">` block. Replace it entirely with:

```tsx
{!showAnswers && (
  <div className="glass p-6 rounded-3xl mb-12 max-w-2xl mx-auto w-full">
    <div className="font-mono text-xs tracking-widest text-gray-500 mb-4 uppercase">
      Top Pilots — After Q{currentQuestionIndex + 1}
    </div>
    {players.slice(0, 5).map((p, idx) => {
      const pts = p.scoreHistory.at(-1) ?? 0;
      const delta = rankDelta(p, idx);
      const rankColor =
        idx === 0 ? 'text-yellow-400' :
        idx === 2 ? 'text-orange-600' :
        'text-gray-400';
      return (
        <div
          key={p.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-2 ${
            idx === 0 ? 'bg-yellow-400/5 border-l-2 border-yellow-400' : 'bg-white/5'
          }`}
        >
          <span className={`font-mono font-bold w-5 text-center ${rankColor}`}>{idx + 1}</span>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-white/20 text-sm"
            style={{ backgroundColor: p.color, boxShadow: `0 0 8px ${p.color}50` }}
          >
            {p.avatar}
          </div>
          <span className="text-white font-semibold flex-1">{p.name}</span>
          <span className={`font-mono text-sm w-14 text-right ${pts > 0 ? 'text-neon-green' : 'text-gray-600'}`}>
            {pts > 0 ? `+${pts}` : '—'}
          </span>
          <span className={`text-base w-5 text-center ${
            delta === 'up' ? 'text-neon-green' :
            delta === 'down' ? 'text-red-500' :
            'text-gray-600'
          }`}>
            {delta === 'up' ? '↑' : delta === 'down' ? '↓' : '—'}
          </span>
          <span className="font-mono font-bold text-neon-blue w-16 text-right">{p.score} pts</span>
        </div>
      );
    })}
  </div>
)}

{showAnswers && (
  <div className="glass p-8 rounded-3xl mb-12">
    <h3 className="text-3xl font-bold mb-8 text-center">{question.text}</h3>
    <div className="grid grid-cols-1 gap-4 max-w-3xl mx-auto">
      {(() => {
        const total = answerCounts.reduce((a, b) => a + b, 0);
        return question.options.map((opt, i) => {
          const isCorrect = i === question.correctIndex;
          const count = answerCounts[i] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div
              key={i}
              className={`p-6 rounded-2xl flex flex-col gap-3 text-xl font-bold ${
                isCorrect
                  ? 'bg-neon-green/20 border-2 border-neon-green text-neon-green shadow-[0_0_15px_rgba(52,211,153,0.3)]'
                  : 'bg-red-500/20 border border-red-500/50 text-red-500 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{opt}</span>
                <div className="flex items-center gap-3">
                  {isCorrect && (
                    <span className="bg-neon-green text-black px-3 py-1 rounded text-sm shadow-[0_0_15px_rgba(52,211,153,0.6)]">
                      CORRECT ORBIT
                    </span>
                  )}
                  <span className="vote-count font-mono text-lg">
                    {count}{total > 0 ? ` (${pct}%)` : ''}
                  </span>
                </div>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    isCorrect ? 'bg-neon-green/80' : 'bg-red-500/60'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        });
      })()}
    </div>
  </div>
)}
```

- [ ] **Step 3: Verify types**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Run the dev server and test manually**

```bash
npm run dev
```

Open `http://localhost:3000/host`. Start a game with 2+ players (use the `/demo` route for a solo test if needed).

After clicking "End Early" or letting a question timer expire, verify:
1. QUESTION_RESULTS screen shows the leaderboard by default (not answer bars)
2. Up to 5 rows appear, sorted by score descending
3. Rank #1 row has a gold left border and subtle gold background
4. Each row shows: rank number, avatar, name, points this round (+N or —), rank change arrow (↑/↓/—), total score
5. Clicking "view answers" switches to the answer distribution
6. Clicking "hide answers" returns to the leaderboard
7. Clicking "Next" advances to the next question; when the next QUESTION_RESULTS appears, the leaderboard is shown again (not answers)
8. On question 1, all rank change arrows show — (no movement)

- [ ] **Step 5: Commit**

```bash
git add src/components/HostView.tsx
git commit -m "feat: show per-question leaderboard with rank deltas on question results screen"
```
