# Game Polish Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add auto-advance timer, per-option vote stats, and a results history page to StellarTrivia.

**Architecture:** Server owns all game-state mutations — the timer fires `triggerShowResults()` server-side; vote counts are tracked in-memory and broadcast via the existing `game-state-update` event; history is served by two new Express routes that query Supabase with the service-role client. The Socket.io game loop is unchanged except for the new timer and vote-count fields.

**Tech Stack:** Node.js / Express / Socket.io, React 19, Zustand, Supabase JS v2, Tailwind CSS v4, Vitest + Supertest

---

## File Map

| File | Change |
|---|---|
| `server.ts` | Add `questionTimer`, `answerCounts`, `triggerShowResults()`; update `start-game`, `next-question`, `show-results`, `disconnect` handlers; register games router |
| `server/routes/games.ts` | **New** — `GET /api/games` and `GET /api/games/:id` |
| `server/__tests__/games.test.ts` | **New** — auth guard tests for games routes |
| `src/store.ts` | Add `answerCounts: number[]` to state + `game-state-update` handler |
| `src/components/HostView.tsx` | Add vote bars in `QUESTION_RESULTS`; update button label in `QUESTION_ACTIVE` |
| `src/components/quiz/QuizListPage.tsx` | Add "Past Games" nav link |
| `src/App.tsx` | Add `/games` and `/games/:id` routes |
| `src/components/games/GameHistoryPage.tsx` | **New** |
| `src/components/games/GameDetailPage.tsx` | **New** |

---

## Task 1: Server — Auto-advance timer

**Files:**
- Modify: `server.ts`

- [ ] **Step 1: Add `questionTimer` variable to game state block**

In `server.ts`, after the `let dbParticipantIds` line (~line 36), add:

```typescript
let questionTimer: ReturnType<typeof setTimeout> | null = null;
```

- [ ] **Step 2: Extract `triggerShowResults()` helper**

Insert this function directly before `broadcastState()` (before line ~55). It contains the existing `show-results` socket handler body, plus timer cleanup and a guard against double-firing:

```typescript
function triggerShowResults() {
  if (gameState !== 'QUESTION_ACTIVE') return;
  if (questionTimer) { clearTimeout(questionTimer); questionTimer = null; }

  Object.keys(players).forEach(pId => {
    if (!players[pId].hasAnswered) players[pId].lastPointsEarned = 0;
  });

  gameState = 'QUESTION_RESULTS';
  broadcastState();

  if (dbSessionId) {
    (async () => {
      const { error } = await supabaseAdmin.from('game_sessions')
        .update({ state: 'question_reveal' }).eq('id', dbSessionId!);
      if (error) console.error('show-results update:', error);
    })();
  }
}
```

- [ ] **Step 3: Update the `show-results` socket handler to delegate to `triggerShowResults()`**

Replace the entire `socket.on("show-results", ...)` block (currently lines ~125–142) with:

```typescript
socket.on("show-results", () => {
  if (socket.id !== gameHostSocketId) return;
  triggerShowResults();
});
```

- [ ] **Step 4: Start the timer when `start-game` fires**

In the `socket.on("start-game", ...)` handler, after `broadcastState()` (before the `if (dbSessionId)` block), add:

```typescript
if (questionTimer) clearTimeout(questionTimer);
questionTimer = setTimeout(triggerShowResults, questions[currentQuestionIndex].timeLimit);
```

- [ ] **Step 5: Reset and restart the timer on `next-question`**

In the `if (currentQuestionIndex < questions.length - 1)` branch of `socket.on("next-question", ...)`, after `broadcastState()`, add:

```typescript
if (questionTimer) clearTimeout(questionTimer);
questionTimer = setTimeout(triggerShowResults, questions[currentQuestionIndex].timeLimit);
```

In the `else` branch (FINAL_LEADERBOARD), before `broadcastState()`, add:

```typescript
if (questionTimer) { clearTimeout(questionTimer); questionTimer = null; }
```

- [ ] **Step 6: Cancel the timer on host disconnect**

In `socket.on("disconnect", ...)`, inside the `if (socket.id === gameHostSocketId)` block, after the `io.emit("game-ended", ...)` line, add:

```typescript
if (questionTimer) { clearTimeout(questionTimer); questionTimer = null; }
```

- [ ] **Step 7: Verify the timer works manually**

```bash
npm run dev
```

Open `/host?quizId=<a-quiz-id>`. Start a game, start a question, wait for the timer bar to reach zero — the results screen should appear automatically without clicking "End Question". Then try again and click "End Question & Show Results" before time runs out — it should also work (and cancel the timer so it doesn't fire twice).

- [ ] **Step 8: Commit**

```bash
git add server.ts
git commit -m "feat: server-side auto-advance timer for questions"
```

---

## Task 2: Server — Vote tallies + Store

**Files:**
- Modify: `server.ts`
- Modify: `src/store.ts`

- [ ] **Step 1: Add `answerCounts` to server game state**

In `server.ts`, after the `let questionTimer` line from Task 1, add:

```typescript
let answerCounts: number[] = [];
```

- [ ] **Step 2: Reset `answerCounts` when `start-game` fires**

In the `socket.on("start-game", ...)` handler, after `questionStartTime = Date.now()` and the player reset loop, add:

```typescript
answerCounts = new Array(questions[currentQuestionIndex].options.length).fill(0);
```

- [ ] **Step 3: Reset `answerCounts` on each `next-question`**

In the `if (currentQuestionIndex < questions.length - 1)` branch of `socket.on("next-question", ...)`, after `questionStartTime = Date.now()` and the player reset loop, add:

```typescript
answerCounts = new Array(questions[currentQuestionIndex].options.length).fill(0);
```

- [ ] **Step 4: Increment the count on `submit-answer`**

In `socket.on("submit-answer", ...)`, immediately after `player.hasAnswered = true;`, add:

```typescript
if (answerIndex >= 0 && answerIndex < answerCounts.length) {
  answerCounts[answerIndex]++;
}
```

- [ ] **Step 5: Include `answerCounts` in `broadcastState()`**

Replace the `broadcastState` function body so the emitted payload includes the new field:

```typescript
function broadcastState() {
  const playersList = Object.values(players).sort((a, b) => b.score - a.score);
  io.emit("game-state-update", {
    gamePin,
    gameState,
    players: playersList,
    currentQuestionIndex,
    question: questions[currentQuestionIndex],
    totalQuestions: questions.length,
    questionStartTime,
    answerCounts,
  });
}
```

- [ ] **Step 6: Add `answerCounts` to the Zustand store**

In `src/store.ts`, add `answerCounts: number[]` to the `GameStore` interface (after `error: string | null`):

```typescript
answerCounts: number[];
```

Add the initial value (after `error: null`):

```typescript
answerCounts: [],
```

In the `socket.on('game-state-update', ...)` handler, add `answerCounts` to the `set({...})` call:

```typescript
set({
  gamePin: data.gamePin,
  gameState: data.gameState,
  players: data.players,
  currentQuestionIndex: data.currentQuestionIndex,
  question: data.question,
  totalQuestions: data.totalQuestions,
  questionStartTime: data.questionStartTime,
  answerCounts: data.answerCounts ?? [],
  ...(data.gameState === 'QUESTION_ACTIVE' && get().gameState !== 'QUESTION_ACTIVE' ? { answerFeedback: null } : {})
});
```

- [ ] **Step 7: Run type check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add server.ts src/store.ts
git commit -m "feat: broadcast per-option vote counts in game-state-update"
```

---

## Task 3: HostView — Vote bars + End Early label

**Files:**
- Modify: `src/components/HostView.tsx`

- [ ] **Step 1: Import `answerCounts` from the store**

In `src/components/HostView.tsx`, update the destructured store values (around line 52–55) to include `answerCounts`:

```typescript
const {
  socket, gamePin, gameState, players, question, currentQuestionIndex,
  totalQuestions, hostGame, startGame, showResults, nextQuestion,
  questionStartTime, connect, answerCounts,
} = useGameStore();
```

- [ ] **Step 2: Update the "End Question" button label in `QUESTION_ACTIVE`**

Find the button at the bottom of the `QUESTION_ACTIVE` block (~line 210–216). Change the label text from "End Question & Show Results" to "End Early":

```tsx
<div className="flex justify-end gap-4 p-4 glass fixed bottom-8 right-8 z-10 rounded-3xl">
  <button
    onClick={showResults}
    className="py-4 px-8 text-white font-black rounded-[2rem] text-lg flex items-center gap-2 uppercase tracking-tighter btn-funky"
  >
    <SkipForward className="w-5 h-5" /> End Early
  </button>
</div>
```

- [ ] **Step 3: Add vote bars to the `QUESTION_RESULTS` options grid**

In the `QUESTION_RESULTS` block, replace the `question.options.map(...)` render (lines ~228–237) with the version below that shows an inline bar and count for each option:

```tsx
{question.options.map((opt, i) => {
  const isCorrect = i === question.correctIndex;
  const count = answerCounts[i] ?? 0;
  const total = answerCounts.reduce((a, b) => a + b, 0);
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div
      key={i}
      className={`p-6 rounded-2xl flex flex-col gap-3 text-xl font-bold ${
        isCorrect
          ? 'bg-neon-green/20 border-2 border-neon-green text-neon-green shadow-[0_0_15px_rgba(52,211,153,0.3)]'
          : 'bg-red-500/20 border border-red-500/50 text-red-500 opacity-60 mix-blend-screen'
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
          <span className="font-mono text-lg">
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
})}
```

- [ ] **Step 4: Run type check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Test visually**

```bash
npm run dev
```

Host a game, join from a second browser tab as a player, start a question, submit answers from the player tab, then click "End Early" on the host tab. The results screen should show bars proportional to votes on each option.

- [ ] **Step 6: Commit**

```bash
git add src/components/HostView.tsx
git commit -m "feat: vote bars on question results screen, End Early button"
```

---

## Task 4: Server — Games REST routes

**Files:**
- Create: `server/routes/games.ts`
- Create: `server/__tests__/games.test.ts`
- Modify: `server.ts`

- [ ] **Step 1: Write failing auth tests**

Create `server/__tests__/games.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } }, error: null,
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    }),
  },
}));

describe('Games API', () => {
  it('GET /api/games returns 401 without token', async () => {
    const { gamesRouter } = await import('../routes/games.js');
    const app = express();
    app.use(express.json());
    app.use('/api/games', gamesRouter);
    const res = await request(app).get('/api/games');
    expect(res.status).toBe(401);
  });

  it('GET /api/games returns 200 with valid token', async () => {
    const { supabaseAdmin } = await import('../lib/supabase.js');
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    const { gamesRouter } = await import('../routes/games.js');
    const app = express();
    app.use(express.json());
    app.use('/api/games', gamesRouter);
    const res = await request(app)
      .get('/api/games')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/games/:id returns 401 without token', async () => {
    const { gamesRouter } = await import('../routes/games.js');
    const app = express();
    app.use(express.json());
    app.use('/api/games', gamesRouter);
    const res = await request(app).get('/api/games/some-id');
    expect(res.status).toBe(401);
  });

  it('GET /api/games/:id returns 404 for missing session', async () => {
    const { supabaseAdmin } = await import('../lib/supabase.js');
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    });
    const { gamesRouter } = await import('../routes/games.js');
    const app = express();
    app.use(express.json());
    app.use('/api/games', gamesRouter);
    const res = await request(app)
      .get('/api/games/missing-id')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests — expect them to fail with import error**

```bash
npm test -- server/__tests__/games.test.ts
```

Expected: fails because `server/routes/games.ts` doesn't exist yet.

- [ ] **Step 3: Create `server/routes/games.ts`**

```typescript
import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

export const gamesRouter = Router();
gamesRouter.use(requireAuth);

gamesRouter.get('/', async (req: AuthRequest, res) => {
  const { data: userQuizzes, error: qErr } = await supabaseAdmin
    .from('quizzes')
    .select('id, title')
    .eq('host_id', req.userId!);

  if (qErr) { res.status(500).json({ error: qErr.message }); return; }
  if (!userQuizzes?.length) { res.json([]); return; }

  const quizMap = new Map(userQuizzes.map((q) => [q.id, q.title]));
  const quizIds = Array.from(quizMap.keys());

  const { data: sessions, error: sErr } = await supabaseAdmin
    .from('game_sessions')
    .select('id, quiz_id, pin, state, started_at, ended_at')
    .in('quiz_id', quizIds)
    .order('started_at', { ascending: false });

  if (sErr) { res.status(500).json({ error: sErr.message }); return; }
  if (!sessions?.length) { res.json([]); return; }

  const sessionIds = sessions.map((s) => s.id);
  const { data: pRows } = await supabaseAdmin
    .from('participants')
    .select('session_id')
    .in('session_id', sessionIds);

  const countMap = new Map<string, number>();
  for (const p of pRows ?? []) {
    countMap.set(p.session_id, (countMap.get(p.session_id) ?? 0) + 1);
  }

  res.json(
    sessions.map((s) => ({
      id: s.id,
      pin: s.pin,
      state: s.state,
      started_at: s.started_at,
      ended_at: s.ended_at,
      quiz_title: quizMap.get(s.quiz_id) ?? '',
      participant_count: countMap.get(s.id) ?? 0,
    }))
  );
});

gamesRouter.get('/:id', async (req: AuthRequest, res) => {
  const { data: session, error: sErr } = await supabaseAdmin
    .from('game_sessions')
    .select('id, quiz_id, pin, state, started_at, ended_at')
    .eq('id', req.params.id)
    .single();

  if (sErr || !session) { res.status(404).json({ error: 'Not found' }); return; }

  const { data: quiz, error: qErr } = await supabaseAdmin
    .from('quizzes')
    .select('id, title')
    .eq('id', session.quiz_id)
    .eq('host_id', req.userId!)
    .single();

  if (qErr || !quiz) { res.status(404).json({ error: 'Not found' }); return; }

  const { data: participants } = await supabaseAdmin
    .from('participants')
    .select('id, display_name, avatar_color, avatar_emoji, total_score')
    .eq('session_id', req.params.id)
    .order('total_score', { ascending: false });

  const { data: questions } = await supabaseAdmin
    .from('questions')
    .select('id, text, options, correct_index, order_index')
    .eq('quiz_id', session.quiz_id)
    .order('order_index');

  const participantIds = (participants ?? []).map((p) => p.id);
  let answers: { question_id: string; selected_index: number }[] = [];
  if (participantIds.length > 0) {
    const { data: aRows } = await supabaseAdmin
      .from('answers')
      .select('question_id, selected_index')
      .in('participant_id', participantIds);
    answers = aRows ?? [];
  }

  const answerMap = new Map<string, number[]>();
  for (const q of questions ?? []) {
    answerMap.set(q.id, new Array((q.options as string[]).length).fill(0));
  }
  for (const a of answers) {
    const counts = answerMap.get(a.question_id);
    if (counts && a.selected_index < counts.length) counts[a.selected_index]++;
  }

  res.json({
    session: {
      id: session.id,
      pin: session.pin,
      state: session.state,
      started_at: session.started_at,
      ended_at: session.ended_at,
      quiz_title: quiz.title,
    },
    participants: participants ?? [],
    questions: (questions ?? []).map((q) => ({
      ...q,
      answer_counts: answerMap.get(q.id) ?? [],
    })),
  });
});
```

- [ ] **Step 4: Run tests — expect them to pass**

```bash
npm test -- server/__tests__/games.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Register the games router in `server.ts`**

In `server.ts`, add the import after the existing `quizRouter` import (~line 7):

```typescript
import { gamesRouter } from "./server/routes/games.js";
```

In the API routes section (~line 307), add after `app.use('/api/quizzes', quizRouter)`:

```typescript
app.use('/api/games', gamesRouter);
```

- [ ] **Step 6: Run type check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add server/routes/games.ts server/__tests__/games.test.ts server.ts
git commit -m "feat: GET /api/games and GET /api/games/:id routes"
```

---

## Task 5: Client — History pages + routing

**Files:**
- Create: `src/components/games/GameHistoryPage.tsx`
- Create: `src/components/games/GameDetailPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/quiz/QuizListPage.tsx`

- [ ] **Step 1: Create `src/components/games/GameHistoryPage.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { History, ArrowLeft, ChevronRight } from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface GameSession {
  id: string;
  pin: string;
  state: string;
  started_at: string | null;
  ended_at: string | null;
  quiz_title: string;
  participant_count: number;
}

export function GameHistoryPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/games')
      .then((r) => r.json())
      .then((data) => { setSessions(data); setLoading(false); });
  }, []);

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => navigate('/quizzes')}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <History className="text-neon-blue" /> Past Games
          </h1>
          <p className="text-gray-500 text-sm font-mono mt-1">Your completed game sessions</p>
        </div>
      </div>

      {loading && (
        <div className="text-center text-gray-500 font-mono py-20">Loading...</div>
      )}

      {!loading && sessions.length === 0 && (
        <div className="text-center text-gray-500 font-mono py-20">
          No games played yet. Host a quiz to get started!
        </div>
      )}

      <div className="space-y-4">
        {sessions.map((s, i) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass p-5 rounded-2xl flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer"
            onClick={() => navigate(`/games/${s.id}`)}
          >
            <div>
              <div className="font-bold text-lg text-white">{s.quiz_title}</div>
              <div className="text-gray-400 text-sm font-mono mt-1">
                {s.started_at
                  ? new Date(s.started_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })
                  : 'Not started'}
                {' · '}PIN {s.pin}
                {' · '}{s.participant_count} player{s.participant_count !== 1 ? 's' : ''}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono px-2 py-1 rounded-lg bg-neon-green/10 text-neon-green border border-neon-green/20">
                {s.state === 'ended' ? 'Ended' : s.state}
              </span>
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/games/GameDetailPage.tsx`**

```tsx
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
```

- [ ] **Step 3: Add routes in `src/App.tsx`**

Add the two new imports after the existing quiz page imports (~line 11):

```typescript
import { GameHistoryPage } from './components/games/GameHistoryPage';
import { GameDetailPage } from './components/games/GameDetailPage';
```

Add two new routes inside `<Routes>` after the `/quizzes/:id/edit` route (~line 32):

```tsx
<Route path="/games" element={<RequireAuth><GameHistoryPage /></RequireAuth>} />
<Route path="/games/:id" element={<RequireAuth><GameDetailPage /></RequireAuth>} />
```

- [ ] **Step 4: Add "Past Games" link to `QuizListPage`**

In `src/components/quiz/QuizListPage.tsx`, add the import for `History` from lucide-react (add to existing import line ~line 4):

```typescript
import { Plus, Play, Edit2, Copy, Trash2, CheckCircle, Clock, LogOut, History } from 'lucide-react';
```

In the header `div` (around line 59–61), add a "Past Games" button alongside the existing controls. Find the header row that contains the sign-out button and add before it:

```tsx
<button
  onClick={() => navigate('/games')}
  className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors px-3 py-2 glass rounded-lg"
>
  <History className="w-4 h-4" /> Past Games
</button>
```

- [ ] **Step 5: Run type check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Test the full flow**

```bash
npm run dev
```

1. Log in and navigate to `/quizzes` — confirm "Past Games" button is visible
2. Click "Past Games" — confirm `/games` loads with a list of past sessions
3. Click a session — confirm `/games/:id` shows scores + question breakdown with bars
4. Click the back arrow — returns to `/games`

- [ ] **Step 7: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/games/GameHistoryPage.tsx src/components/games/GameDetailPage.tsx src/App.tsx src/components/quiz/QuizListPage.tsx
git commit -m "feat: results history pages at /games and /games/:id"
```
