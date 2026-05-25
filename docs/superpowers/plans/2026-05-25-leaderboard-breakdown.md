# Leaderboard Breakdown View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Show Breakdown" toggle button to the host's end-of-game screen that replaces the podium with a per-question score grid for the top 5 players.

**Architecture:** Track `scoreHistory: number[]` per player on the server (pushed in `triggerShowResults`), flow it through `broadcastState` to the client, then render it in a new `BreakdownTable` component in `HostView.tsx` behind a local toggle state.

**Tech Stack:** TypeScript, Express + Socket.io (server), React 19 + Zustand (client), Tailwind CSS v4

---

## File Map

| File | Change |
|------|--------|
| `server.ts` | Add `scoreHistory: number[]` to `Player` interface; initialize `[]` on join; push `lastPointsEarned` for all players in `triggerShowResults` after the non-answerer zeroing loop |
| `src/store.ts` | Add `scoreHistory: number[]` to `Player` interface |
| `src/components/HostView.tsx` | Add `showBreakdown` local state + toggle button + conditional rendering; add `BreakdownTable` component at bottom of file |

---

## Task 1: Server — add `scoreHistory` tracking

**Files:**
- Modify: `server.ts:15-24` (Player interface)
- Modify: `server.ts:284-325` (join-game handler — player initialization)
- Modify: `server.ts:98-118` (triggerShowResults — push after zeroing loop)

- [ ] **Step 1: Add `scoreHistory` to the `Player` interface**

In `server.ts`, the `Player` interface starts at line 15. Add `scoreHistory: number[]` as the last field:

```ts
interface Player {
  id: string;
  name: string;
  score: number;
  hasAnswered: boolean;
  lastAnswerTime: number;
  color: string;
  avatar: string;
  lastPointsEarned: number;
  scoreHistory: number[];
}
```

- [ ] **Step 2: Initialize `scoreHistory` when a player joins**

In the `join-game` socket handler (around line 294), add `scoreHistory: []` to the player object:

```ts
session.players[socket.id] = {
  id: socket.id,
  name,
  score: 0,
  hasAnswered: false,
  lastAnswerTime: 0,
  color: randomColor,
  avatar: finalAvatar,
  lastPointsEarned: 0,
  scoreHistory: [],
};
```

- [ ] **Step 3: Push per-question points in `triggerShowResults`**

In `triggerShowResults` (around line 98), after the `forEach` loop that zeroes non-answerers, add a second loop that pushes `lastPointsEarned` into every player's history:

```ts
function triggerShowResults(session: GameSession) {
  if (session.state !== "QUESTION_ACTIVE") return;
  if (session.questionTimer) { clearTimeout(session.questionTimer); session.questionTimer = null; }

  Object.keys(session.players).forEach((pId) => {
    if (!session.players[pId].hasAnswered) session.players[pId].lastPointsEarned = 0;
  });

  // NEW: record this question's points for every player
  Object.keys(session.players).forEach((pId) => {
    session.players[pId].scoreHistory.push(session.players[pId].lastPointsEarned);
  });

  session.state = "QUESTION_RESULTS";
  broadcastState(session);
  // ...rest unchanged
```

`broadcastState` already sends the full `players` array (line 85), so `scoreHistory` flows to clients automatically — no other broadcast changes needed.

- [ ] **Step 4: Run the type-checker to verify no errors**

```bash
npm run lint
```

Expected: no errors. If TypeScript complains about `scoreHistory` missing from an object literal, you've missed one of the initialization sites above.

- [ ] **Step 5: Commit**

```bash
git add server.ts
git commit -m "feat: track per-question score history on server"
```

---

## Task 2: Store — add `scoreHistory` to client `Player` type

**Files:**
- Modify: `src/store.ts:6-15` (Player interface)

- [ ] **Step 1: Add `scoreHistory` to the `Player` interface in `store.ts`**

```ts
export interface Player {
  id: string;
  name: string;
  score: number;
  hasAnswered: boolean;
  lastAnswerTime: number;
  color: string;
  avatar: string;
  lastPointsEarned: number;
  scoreHistory: number[];
}
```

- [ ] **Step 2: Run the type-checker**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/store.ts
git commit -m "feat: add scoreHistory to client Player type"
```

---

## Task 3: HostView — `BreakdownTable` component and toggle

**Files:**
- Modify: `src/components/HostView.tsx`

### Step group A — `BreakdownTable` component

- [ ] **Step 1: Add `BreakdownTable` at the bottom of `HostView.tsx`**

After the closing brace of `LeaderboardPodium` (the last function in the file, around line 389), append:

```tsx
function BreakdownTable({ players, totalQuestions }: { players: Player[], totalQuestions: number }) {
  const top5 = players.slice(0, 5);
  const qIndices = Array.from({ length: totalQuestions }, (_, i) => i);

  return (
    <div className="glass rounded-2xl overflow-x-auto">
      <table className="w-full text-sm font-mono">
        <thead>
          <tr className="border-b border-white/10">
            <th className="p-3 text-left text-gray-500 uppercase tracking-widest text-xs">#</th>
            <th className="p-3 text-left text-gray-500 uppercase tracking-widest text-xs">Player</th>
            {qIndices.map(i => (
              <th key={i} className="p-3 text-center text-gray-500 uppercase tracking-widest text-xs">Q{i + 1}</th>
            ))}
            <th className="p-3 text-center text-gray-500 uppercase tracking-widest text-xs">✓</th>
            <th className="p-3 text-right text-gray-500 uppercase tracking-widest text-xs">Total</th>
          </tr>
        </thead>
        <tbody>
          {top5.map((p, idx) => {
            const history = p.scoreHistory ?? [];
            const correct = history.filter(pts => pts > 0).length;
            return (
              <tr key={p.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td className="p-3 text-gray-500 font-bold">{idx + 1}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0"
                      style={{ backgroundColor: p.color, boxShadow: `0 0 8px ${p.color}50` }}
                    >
                      {p.avatar}
                    </div>
                    <span className="font-bold text-white">{p.name}</span>
                  </div>
                </td>
                {qIndices.map(qi => {
                  const pts = history[qi] ?? 0;
                  const colorClass =
                    pts === 1000 ? 'text-yellow-400' :
                    pts === 800  ? 'text-neon-blue'  :
                    pts === 500  ? 'text-indigo-400' :
                                   'text-gray-600';
                  return (
                    <td key={qi} className={`p-3 text-center font-bold ${colorClass}`}>
                      {pts > 0 ? pts : '—'}
                    </td>
                  );
                })}
                <td className="p-3 text-center text-gray-400">{correct}/{totalQuestions}</td>
                <td className="p-3 text-right font-black text-neon-blue">{p.score}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Run the type-checker**

```bash
npm run lint
```

Expected: no errors. `Player` is imported from `../store` at the top of the file, so the prop type resolves correctly.

### Step group B — toggle state + button + conditional rendering

- [ ] **Step 3: Add `showBreakdown` state inside the `HostView` function**

Near the top of `HostView` (after the existing `useState` calls for `loadingQuiz`, `pendingQuestions`, `bigScreen`), add:

```tsx
const [showBreakdown, setShowBreakdown] = useState(false);
```

- [ ] **Step 4: Wrap the podium + player list in a conditional and add the breakdown panel**

Replace the entire `{gameState === 'FINAL_LEADERBOARD' && (...)}` block (lines 329–372) with:

```tsx
{gameState === 'FINAL_LEADERBOARD' && (
  <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full pt-12 overflow-y-auto">
    <TerminalHeader text="MISSION OVER" />

    {!showBreakdown && (
      <>
        <div className="mt-12 flex items-end justify-center gap-4 h-64 mb-16">
          {players.length >= 2 && (
            <LeaderboardPodium player={players[1]} rank={2} height={160} color="border-gray-400" bgColor="bg-gray-400/20" />
          )}
          {players.length >= 1 && (
            <LeaderboardPodium player={players[0]} rank={1} height={220} color="border-yellow-400" bgColor="bg-yellow-400/20" />
          )}
          {players.length >= 3 && (
            <LeaderboardPodium player={players[2]} rank={3} height={120} color="border-orange-600" bgColor="bg-orange-600/20" />
          )}
        </div>

        <div className="space-y-4">
          {players.slice(3).map((p, i) => (
            <div key={p.id} className="glass p-4 rounded-xl flex items-center justify-between transition-transform hover:scale-[1.01]">
              <div className="flex items-center gap-4">
                <span className="text-gray-500 font-mono w-8 text-right font-bold">{i + 4}</span>
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border border-white/20 text-xl"
                  style={{ backgroundColor: p.color, boxShadow: `0 0 10px ${p.color}50` }}
                >
                  {p.avatar}
                </div>
                <span className="text-xl font-bold">{p.name}</span>
              </div>
              <span className="led-digit leaderboard-score font-mono text-neon-blue font-bold">{p.score} pts</span>
            </div>
          ))}
        </div>
      </>
    )}

    {showBreakdown && (
      <div className="mt-8">
        <BreakdownTable players={players} totalQuestions={totalQuestions} />
      </div>
    )}

    <div className="mt-16 flex justify-center gap-4">
      <button
        onClick={() => setShowBreakdown(b => !b)}
        className="px-8 py-4 glass rounded-xl font-bold hover:bg-white/10 transition-colors uppercase tracking-widest text-sm text-gray-300"
      >
        {showBreakdown ? 'Hide Breakdown' : 'Show Breakdown'}
      </button>
      <button
        onClick={() => window.location.href = '/'}
        className="px-8 py-4 glass rounded-xl font-bold hover:bg-white/10 transition-colors uppercase tracking-widest text-sm text-gray-300"
      >
        Return to Base
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 5: Run the type-checker**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Manual smoke test**

```bash
npm run dev
```

1. Open `http://localhost:3000/host?quizId=<any-quiz-id>` in one tab (or use the DemoPlayer at `/demo`)
2. Have 2+ players join at `http://localhost:3000/join`
3. Play through all questions
4. On the `MISSION OVER` screen, verify:
   - "Show Breakdown" button is visible alongside "Return to Base"
   - Clicking it hides the podium and shows the score grid table
   - The table has one row per top-5 player, one column per question
   - Points are colored: gold for 1000, cyan for 800, indigo for 500, muted `—` for 0
   - The `✓` column shows correct count out of total questions
   - The `Total` column matches the score shown on the podium
   - Clicking "Hide Breakdown" restores the podium

- [ ] **Step 7: Commit**

```bash
git add src/components/HostView.tsx
git commit -m "feat: add leaderboard breakdown toggle to MISSION OVER screen"
```
