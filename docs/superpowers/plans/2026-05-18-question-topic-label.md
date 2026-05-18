# Question Topic Label — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-question topic field (5 predefined values) to the quiz builder, show a 3-second full-screen topic reveal before each question, and display a topic badge above the question text during the question.

**Architecture:** New `src/lib/topics.ts` holds the shared topic data. The server gains a `TOPIC_REVEAL` game state inserted before `QUESTION_ACTIVE`; question-start logic is extracted into a shared `startQuestion()` / `activateQuestion()` pair. A shared `TopicRevealScreen` component renders in both host and player views.

**Tech Stack:** React 19, TypeScript, Zustand, Socket.io, Supabase (PostgreSQL), Express, Tailwind CSS v4

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `db/migrations/002_add_question_topic.sql` | Create | Add nullable `topic` column to `questions` |
| `db/schema.sql` | Modify | Add `topic` column to canonical schema |
| `src/lib/topics.ts` | Create | `TOPICS` array, `TopicKey` type, `TOPIC_META` colors/labels |
| `src/store.ts` | Modify | Add `topic` to `Question`; add `TOPIC_REVEAL` to `GameState` |
| `src/components/quiz/QuestionCard.tsx` | Modify | Add `topic` to `QuestionData`; add topic pills in expanded form |
| `server/routes/quiz.ts` | Modify | Add `topic` to POST insert and PATCH allowlist |
| `server.ts` | Modify | Add `TOPIC_REVEAL` state; extract `startQuestion()` / `activateQuestion()` |
| `src/components/TopicReveal.tsx` | Create | Shared `TopicRevealScreen` component (countdown + big label) |
| `src/components/HostView.tsx` | Modify | Handle `TOPIC_REVEAL` state; add topic badge in `QUESTION_ACTIVE` |
| `src/components/PlayerView.tsx` | Modify | Handle `TOPIC_REVEAL` state; add topic badge in `QUESTION_ACTIVE` |

---

## Task 1: DB migration and topics constant

**Files:**
- Create: `db/migrations/002_add_question_topic.sql`
- Modify: `db/schema.sql`
- Create: `src/lib/topics.ts`

- [ ] **Step 1: Create the migration file**

```sql
-- db/migrations/002_add_question_topic.sql
alter table questions
  add column if not exists topic text
    check (topic in ('maths', 'riddles', 'idioms', 'rearrange_letters', 'general'));
```

- [ ] **Step 2: Run the migration in Supabase**

Open the Supabase dashboard SQL editor for this project and run the contents of `db/migrations/002_add_question_topic.sql`. Verify the `questions` table now has a nullable `topic` column.

- [ ] **Step 3: Update the canonical schema**

In `db/schema.sql`, find the `questions` table definition and add the `topic` column after `order_index`:

```sql
  order_index      integer not null default 0,
  topic            text check (topic in ('maths', 'riddles', 'idioms', 'rearrange_letters', 'general'))
```

- [ ] **Step 4: Create `src/lib/topics.ts`**

```ts
export const TOPICS = [
  'maths',
  'riddles',
  'idioms',
  'rearrange_letters',
  'general',
] as const;

export type TopicKey = (typeof TOPICS)[number];

export const TOPIC_META: Record<TopicKey, { label: string; color: string; bg: string }> = {
  maths:             { label: 'Maths',            color: 'text-cyan-300',    bg: 'bg-cyan-500/20 border-cyan-400/50' },
  riddles:           { label: 'Riddles',          color: 'text-violet-300',  bg: 'bg-violet-500/20 border-violet-400/50' },
  idioms:            { label: 'Idioms',           color: 'text-amber-300',   bg: 'bg-amber-500/20 border-amber-400/50' },
  rearrange_letters: { label: 'Rearrange Letters',color: 'text-rose-300',    bg: 'bg-rose-500/20 border-rose-400/50' },
  general:           { label: 'General',          color: 'text-emerald-300', bg: 'bg-emerald-500/20 border-emerald-400/50' },
};
```

- [ ] **Step 5: Verify type-check passes**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/002_add_question_topic.sql db/schema.sql src/lib/topics.ts
git commit -m "feat: add topic column migration and TOPIC_META constant"
```

---

## Task 2: Type updates — store and QuestionCard

**Files:**
- Modify: `src/store.ts`
- Modify: `src/components/quiz/QuestionCard.tsx`

- [ ] **Step 1: Add `TOPIC_REVEAL` to `GameState` in `src/store.ts`**

Find:
```ts
export type GameState = 'LOBBY' | 'QUESTION_ACTIVE' | 'QUESTION_RESULTS' | 'FINAL_LEADERBOARD';
```
Replace with:
```ts
export type GameState = 'LOBBY' | 'TOPIC_REVEAL' | 'QUESTION_ACTIVE' | 'QUESTION_RESULTS' | 'FINAL_LEADERBOARD';
```

- [ ] **Step 2: Add `topic` to the `Question` interface in `src/store.ts`**

Find:
```ts
export interface Question {
  id?: string;
  text: string;
  options: string[];
  correctIndex: number;
  timeLimit: number;
  pointMultiplier?: number;
  imageUrl?: string;
}
```
Replace with:
```ts
export interface Question {
  id?: string;
  text: string;
  options: string[];
  correctIndex: number;
  timeLimit: number;
  pointMultiplier?: number;
  imageUrl?: string;
  topic?: string | null;
}
```

- [ ] **Step 3: Add `topic` to `QuestionData` in `src/components/quiz/QuestionCard.tsx`**

Find:
```ts
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
```
Replace with:
```ts
export interface QuestionData {
  id: string;
  text: string;
  options: string[];
  correct_index: number;
  time_limit_sec: 10 | 20 | 30;
  point_multiplier: 1 | 2;
  order_index: number;
  image_url?: string | null;
  topic?: string | null;
}
```

- [ ] **Step 4: Verify type-check passes**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/store.ts src/components/quiz/QuestionCard.tsx
git commit -m "feat: add topic field to Question and QuestionData types"
```

---

## Task 3: API — accept and persist topic

**Files:**
- Modify: `server/routes/quiz.ts`

- [ ] **Step 1: Add `topic` to the POST handler**

Find the `POST /:id/questions` handler. Change:
```ts
const { text, options, correct_index, time_limit_sec, point_multiplier, order_index } = req.body;
```
To:
```ts
const { text, options, correct_index, time_limit_sec, point_multiplier, order_index, topic } = req.body;
```

Then in the `.insert({...})` call, add after `order_index: order_index ?? 0,`:
```ts
topic: topic ?? null,
```

- [ ] **Step 2: Add `topic` to the PATCH allowlist**

Find:
```ts
const allowed = ['text', 'options', 'correct_index', 'time_limit_sec', 'point_multiplier', 'image_url'];
```
Replace with:
```ts
const allowed = ['text', 'options', 'correct_index', 'time_limit_sec', 'point_multiplier', 'image_url', 'topic'];
```

- [ ] **Step 3: Verify type-check passes**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server/routes/quiz.ts
git commit -m "feat: add topic to question POST insert and PATCH allowlist"
```

---

## Task 4: Server state machine — TOPIC_REVEAL

**Files:**
- Modify: `server.ts`

- [ ] **Step 1: Add `TOPIC_REVEAL` to the server's `gameState` type**

Find in `server.ts`:
```ts
let gameState: "LOBBY" | "QUESTION_ACTIVE" | "QUESTION_RESULTS" | "FINAL_LEADERBOARD" = "LOBBY";
```
Replace with:
```ts
let gameState: "LOBBY" | "TOPIC_REVEAL" | "QUESTION_ACTIVE" | "QUESTION_RESULTS" | "FINAL_LEADERBOARD" = "LOBBY";
```

- [ ] **Step 2: Add `topicRevealTimer` state and `TOPIC_REVEAL_MS` constant**

After the line `let questionTimer: ReturnType<typeof setTimeout> | null = null;`, add:
```ts
let topicRevealTimer: ReturnType<typeof setTimeout> | null = null;
const TOPIC_REVEAL_MS = 3000;
```

- [ ] **Step 3: Add `activateQuestion()` function**

Place this function just before `function triggerShowResults()`:
```ts
function activateQuestion() {
  gameState = 'QUESTION_ACTIVE';
  questionStartTime = Date.now();
  answerCounts = new Array(questions[currentQuestionIndex].options.length).fill(0);
  correctAnswerCount = 0;
  broadcastState();
  if (questionTimer) { clearTimeout(questionTimer); questionTimer = null; }
  questionTimer = setTimeout(triggerShowResults, questions[currentQuestionIndex].timeLimit ?? 20_000);
}
```

- [ ] **Step 4: Add `startQuestion()` function**

Place this function immediately after `activateQuestion()`:
```ts
function startQuestion() {
  if (topicRevealTimer) { clearTimeout(topicRevealTimer); topicRevealTimer = null; }
  if (questionTimer) { clearTimeout(questionTimer); questionTimer = null; }

  Object.keys(players).forEach(pId => {
    players[pId].hasAnswered = false;
    players[pId].lastAnswerTime = 0;
    players[pId].lastPointsEarned = 0;
  });

  const q = questions[currentQuestionIndex];
  if (q.topic) {
    gameState = 'TOPIC_REVEAL';
    broadcastState();
    topicRevealTimer = setTimeout(activateQuestion, TOPIC_REVEAL_MS);
  } else {
    activateQuestion();
  }
}
```

- [ ] **Step 5: Refactor `start-game` handler to use `startQuestion()`**

Find the `socket.on("start-game", ...)` handler body and replace everything from `gameState = "QUESTION_ACTIVE"` through the end of the question timer setup (but keep the DB logging block unchanged):

```ts
socket.on("start-game", () => {
  if (socket.id !== gameHostSocketId) return;
  if (questions.length === 0) return;

  startQuestion();

  if (dbSessionId) {
    (async () => {
      const { error } = await supabaseAdmin.from("game_sessions").update({
        state: "question_active",
        started_at: new Date().toISOString(),
      }).eq("id", dbSessionId!);
      if (error) console.error("start-game update:", error);
    })();
  }
});
```

- [ ] **Step 6: Refactor `next-question` handler to use `startQuestion()`**

Find the `socket.on("next-question", ...)` handler. Replace the branch where `currentQuestionIndex < questions.length - 1` (keep the `else` / FINAL_LEADERBOARD branch unchanged):

```ts
if (currentQuestionIndex < questions.length - 1) {
  currentQuestionIndex++;
  startQuestion();

  if (dbSessionId) {
    (async () => {
      const { error } = await supabaseAdmin.from("game_sessions").update({
        state: "question_active",
        current_question_index: currentQuestionIndex,
      }).eq("id", dbSessionId!);
      if (error) console.error("next-question update:", error);
    })();
  }
}
```

- [ ] **Step 7: Verify type-check passes**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add server.ts
git commit -m "feat: add TOPIC_REVEAL state and extract startQuestion/activateQuestion"
```

---

## Task 5: Quiz builder — topic pills in QuestionCard

**Files:**
- Modify: `src/components/quiz/QuestionCard.tsx`

- [ ] **Step 1: Import `TOPICS`, `TopicKey`, and `TOPIC_META`**

At the top of `QuestionCard.tsx`, add after the existing imports:
```ts
import { TOPICS, TopicKey, TOPIC_META } from '../../lib/topics';
```

- [ ] **Step 2: Add topic pills row in the expanded card body**

In the `expanded` section, find the closing `</div>` of the Time/Points flex row (the one containing `<label>Time limit</label>` and `<label>Points</label>`). Add a new topic row **after** that closing `</div>`:

```tsx
<div>
  <label className="text-xs text-gray-400 block mb-2 uppercase tracking-widest">Topic</label>
  <div className="flex flex-wrap gap-2">
    {TOPICS.map((t) => (
      <button
        key={t}
        onClick={() => onUpdate(question.id, { topic: question.topic === t ? null : t })}
        className={`px-3 py-1 rounded-lg text-sm font-bold transition-colors ${
          question.topic === t ? 'bg-neon-blue text-black' : 'glass hover:bg-white/10'
        }`}
      >
        {TOPIC_META[t].label}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 3: Add topic indicator to the collapsed subtitle**

Find:
```tsx
<p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
  {question.time_limit_sec}s · {question.point_multiplier}× pts · {question.options.filter(Boolean).length} options
  {question.image_url && <><span>·</span><ImageIcon className="w-3 h-3 text-neon-blue" /></>}
</p>
```
Replace with:
```tsx
<p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
  {question.time_limit_sec}s · {question.point_multiplier}× pts · {question.options.filter(Boolean).length} options
  {question.image_url && <><span>·</span><ImageIcon className="w-3 h-3 text-neon-blue" /></>}
  {question.topic && (
    <><span>·</span><span className={TOPIC_META[question.topic as TopicKey]?.color}>{TOPIC_META[question.topic as TopicKey]?.label}</span></>
  )}
</p>
```

- [ ] **Step 4: Verify type-check passes**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Manual test — open quiz builder**

Start the dev server (`npm run dev`), navigate to `/quizzes`, open a quiz, expand a question card, and verify:
- The "Topic" row appears below Time/Points with five pill buttons
- Clicking a pill selects it (highlights in neon-blue)
- Clicking the selected pill deselects it
- The collapsed subtitle shows the topic name in the matching accent color

- [ ] **Step 6: Commit**

```bash
git add src/components/quiz/QuestionCard.tsx
git commit -m "feat: add topic pill selector to QuestionCard builder"
```

---

## Task 6: Shared TopicRevealScreen component

**Files:**
- Create: `src/components/TopicReveal.tsx`

- [ ] **Step 1: Create `src/components/TopicReveal.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { TOPIC_META, TopicKey } from '../lib/topics';

interface Props {
  topic: string;
}

export function TopicRevealScreen({ topic }: Props) {
  const [count, setCount] = useState(3);
  const meta = TOPIC_META[topic as TopicKey];

  useEffect(() => {
    if (count <= 0) return;
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8">
      <p className="text-gray-400 font-mono uppercase tracking-widest text-sm">Next Topic</p>
      <div className={`px-12 py-8 rounded-3xl border glass text-center ${meta.bg}`}>
        <span className={`text-6xl font-black uppercase tracking-widest ${meta.color}`}>
          {meta.label}
        </span>
      </div>
      <p className="text-gray-500 font-mono text-lg">Get ready…</p>
      <span className="text-5xl font-black text-white/40 font-mono tabular-nums">
        {count > 0 ? count : ''}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Verify type-check passes**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/TopicReveal.tsx
git commit -m "feat: add shared TopicRevealScreen component"
```

---

## Task 7: HostView — TOPIC_REVEAL state and topic badge

**Files:**
- Modify: `src/components/HostView.tsx`

- [ ] **Step 1: Add imports**

At the top of `HostView.tsx`, add:
```ts
import { TopicRevealScreen } from './TopicReveal';
import { TOPIC_META, TopicKey } from '../lib/topics';
```

- [ ] **Step 2: Add TOPIC_REVEAL block**

In the JSX, after the `{gameState === 'LOBBY' && ...}` block and before the `{gameState === 'QUESTION_ACTIVE' && ...}` block, add:

```tsx
{gameState === 'TOPIC_REVEAL' && question?.topic && (
  <TopicRevealScreen topic={question.topic} />
)}
```

- [ ] **Step 3: Add topic badge in QUESTION_ACTIVE**

In the `QUESTION_ACTIVE` block, find:
```tsx
<h2 className="question-text text-4xl md:text-5xl font-light italic text-center mb-4 leading-tight">
  {question.text}
</h2>
```
Replace with:
```tsx
{question.topic && (() => {
  const meta = TOPIC_META[question.topic as TopicKey];
  return (
    <div className="flex justify-center mb-3">
      <span className={`px-4 py-1 rounded-full text-sm font-bold uppercase tracking-widest border ${meta.bg} ${meta.color}`}>
        {meta.label}
      </span>
    </div>
  );
})()}
<h2 className="question-text text-4xl md:text-5xl font-light italic text-center mb-4 leading-tight">
  {question.text}
</h2>
```

- [ ] **Step 4: Verify type-check passes**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/HostView.tsx
git commit -m "feat: add TOPIC_REVEAL screen and topic badge to HostView"
```

---

## Task 8: PlayerView — TOPIC_REVEAL state and topic badge

**Files:**
- Modify: `src/components/PlayerView.tsx`

- [ ] **Step 1: Add imports**

At the top of `PlayerView.tsx`, add:
```ts
import { TopicRevealScreen } from './TopicReveal';
import { TOPIC_META, TopicKey } from '../lib/topics';
```

- [ ] **Step 2: Add TOPIC_REVEAL block in the player's main content area**

In the `<div className="flex-1 flex flex-col justify-center p-4">` section, after the `{gameState === 'LOBBY' && ...}` block, add:

```tsx
{gameState === 'TOPIC_REVEAL' && question?.topic && (
  <TopicRevealScreen topic={question.topic} />
)}
```

- [ ] **Step 3: Add topic badge in QUESTION_ACTIVE**

In the `QUESTION_ACTIVE && answerFeedback === null` block, find:
```tsx
<h3 className="text-center text-gray-400 font-bold mb-8 tracking-widest">SELECT YOUR ANSWER</h3>
```
Replace with:
```tsx
{question.topic && (() => {
  const meta = TOPIC_META[question.topic as TopicKey];
  return (
    <div className="flex justify-center mb-2">
      <span className={`px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest border ${meta.bg} ${meta.color}`}>
        {meta.label}
      </span>
    </div>
  );
})()}
<h3 className="text-center text-gray-400 font-bold mb-8 tracking-widest">SELECT YOUR ANSWER</h3>
```

- [ ] **Step 4: Verify type-check passes**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/PlayerView.tsx
git commit -m "feat: add TOPIC_REVEAL screen and topic badge to PlayerView"
```

---

## Task 9: End-to-end manual test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Set a topic on at least two questions**

Navigate to `/quizzes`, open a quiz in the builder, assign topics to questions 1 and 2, leave question 3 (if it exists) without a topic.

- [ ] **Step 3: Run a full game as host + player**

Open `/host?quizId=<your-quiz-id>` in one browser tab and `/join` in another (or on a phone). Join as a player, start the game. Verify:

- Q1 (has topic): topic reveal screen appears for ~3 seconds with the correct label and accent color → transitions to question with topic badge above the question text
- Q2 (has topic): same behavior
- Q3 (no topic, if present): goes straight to question with no badge and no reveal screen
- Player view shows the same reveal screen and badge
- Countdown in the reveal screen counts down 3 → 2 → 1 then disappears
- Question timer does NOT start during the reveal (full time available once question appears)

- [ ] **Step 4: Commit any fixes found during testing, then push**

```bash
git push origin feat/screen-enhancements
```
