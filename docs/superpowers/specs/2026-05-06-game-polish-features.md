# Game Polish Features Design

**Features:** Auto-advance timer · Question vote stats · Results history page

---

## Decisions Summary

| Feature | Decision |
|---|---|
| Auto-advance timer | Server-authoritative; host can also end early |
| Vote stats display | Inline bars on host screen only (not players) |
| History depth | Full detail: list → dedicated `/games/:id` page |
| Data access pattern | Server-authoritative; new REST routes for history |

---

## Feature 1: Auto-advance Timer

### Server (`server.ts`)

- Add `questionTimer: ReturnType<typeof setTimeout> | null` to in-memory game state, initialised to `null`.
- Extract a `triggerShowResults()` helper that contains the existing show-results logic (state transition, DB update, broadcast). Both the timer expiry and the host's "End Early" event call this function.
- When `start-game` or `next-question` fires: call `setTimeout(triggerShowResults, question.timeLimit)` and store the handle in `questionTimer`. Cancel any existing timer first.
- New socket event `end-question`: host emits this to end the question early. Server cancels `questionTimer` and calls `triggerShowResults()` immediately. Only accepted from `gameHostSocketId`.
- Cancel `questionTimer` on: `end-question`, natural timer expiry, `FINAL_LEADERBOARD` reached, host `disconnect`.

### Client

**`store.ts`:** Add `endQuestion: () => void` action that emits `end-question`.

**`HostView.tsx`:** During `QUESTION_ACTIVE`, add an **"End Early"** button that calls `endQuestion()`. This is the host's manual override — the timer auto-fires regardless.

---

## Feature 2: Question Vote Stats

### Server (`server.ts`)

- Add `answerCounts: number[]` to in-memory game state.
- Reset to `new Array(question.options.length).fill(0)` at `start-game` and each `next-question`.
- In `submit-answer` handler: increment `answerCounts[answerIndex]` before calling `broadcastState()`.
- Include `answerCounts` in the `broadcastState()` payload.

### Client

**`store.ts`:** Add `answerCounts: number[]` to `GameState`, initialised to `[]`. Populate from `game-state-update`.

**`HostView.tsx` — `QUESTION_RESULTS` phase:**
- Below each option label, render an inline progress bar: `width = (answerCounts[i] / totalAnswers) * 100%`.
- Show count and percentage to the right of the bar.
- Correct option bar: `neon-green`. Incorrect bars: `red-500/40`, dimmed.
- If `totalAnswers === 0` (no one answered), show bars at 0% with no percentage label.

---

## Feature 3: Results History

### Server — new file `server/routes/games.ts`

Mounted at `/api/games`, protected by `requireAuth` middleware (same as quiz routes).

**`GET /api/games`**
Returns all sessions for the host's quizzes, newest first.
```
JOIN game_sessions → quizzes WHERE quizzes.host_id = userId
SELECT: session id, pin, state, started_at, ended_at, quiz title,
        participant count (subquery or join)
ORDER BY started_at DESC
```

**`GET /api/games/:id`**
Returns full session detail. Verifies ownership via `quizzes.host_id = userId`.
```
{
  session: { id, pin, state, started_at, ended_at, quiz_title },
  participants: [{ id, display_name, avatar_color, avatar_emoji, total_score }]
              sorted by total_score DESC,
  questions: [
    {
      id, text, options, correct_index, order_index,
      answer_counts: [n, n, n, n]   // aggregated from answers table
    }
  ] sorted by order_index ASC
}
```
`answer_counts` is built by grouping `answers` rows for this session by `question_id` and `selected_index`.

Register router in `server.ts`: `app.use('/api/games', gamesRouter)`.

### Client — new pages

**`src/components/games/GameHistoryPage.tsx`** at route `/games`
- Fetches `GET /api/games` on mount via `apiFetch`.
- Renders a list of session cards: quiz title, date, PIN, player count, "View Results →" link.
- Empty state: "No games played yet."
- Protected by `RequireAuth`.

**`src/components/games/GameDetailPage.tsx`** at route `/games/:id`
- Fetches `GET /api/games/:id` on mount.
- Two sections:
  1. **Final Scores** — leaderboard list, top 3 highlighted.
  2. **Question Breakdown** — each question with inline bars (same visual style as Feature 2).
- Breadcrumb: "← Past Games" links to `/games`.
- Protected by `RequireAuth`.

**`src/App.tsx`:** Add routes `/games` and `/games/:id`.

**`src/components/quiz/QuizListPage.tsx`:** Add "Past Games" nav link → `/games`.

---

## Files Changed

| File | Change |
|---|---|
| `server.ts` | Add `questionTimer`, `answerCounts`, `triggerShowResults()`, `end-question` event; register games router |
| `server/routes/games.ts` | **New** — 2 REST endpoints |
| `src/store.ts` | Add `answerCounts`, `endQuestion()` |
| `src/components/HostView.tsx` | "End Early" button; vote bars in results phase |
| `src/components/quiz/QuizListPage.tsx` | "Past Games" link |
| `src/App.tsx` | `/games` and `/games/:id` routes |
| `src/components/games/GameHistoryPage.tsx` | **New** |
| `src/components/games/GameDetailPage.tsx` | **New** |
