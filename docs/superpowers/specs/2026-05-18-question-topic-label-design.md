# Question Topic Label

**Date:** 2026-05-18
**Branch:** feat/screen-enhancements

## Overview

Add a topic field to each quiz question. The host assigns a topic per question in the builder. During a game, a full-screen topic reveal screen appears for 3 seconds before each question, then a topic badge is shown above the question text for the duration of the question — visible to both host and players.

## Topics (predefined, hardcoded)

| Value | Display label |
|---|---|
| `maths` | Maths |
| `riddles` | Riddles |
| `idioms` | Idioms |
| `rearrange_letters` | Rearrange Letters |
| `general` | General |

Topic is optional per question. Questions without a topic skip the reveal screen and show no badge.

## Game State Machine

New state `TOPIC_REVEAL` inserted before every `QUESTION_ACTIVE`:

```
LOBBY → TOPIC_REVEAL → QUESTION_ACTIVE → QUESTION_RESULTS → TOPIC_REVEAL → ...
```

If a question has no topic, the transition skips `TOPIC_REVEAL` and goes directly to `QUESTION_ACTIVE`.

The question countdown timer starts only when `QUESTION_ACTIVE` begins. The 3-second reveal does not reduce question time.

## Data Layer

### DB migration — `db/migrations/002_add_question_topic.sql`

```sql
alter table questions
  add column if not exists topic text
    check (topic in ('maths', 'riddles', 'idioms', 'rearrange_letters', 'general'));
```

Nullable — no default. Existing questions unaffected.

### Type changes

**`src/store.ts` — `Question` interface**
```ts
topic?: string | null;
```

**`src/components/quiz/QuestionCard.tsx` — `QuestionData` interface**
```ts
topic?: string | null;
```

**`src/store.ts` — `GameState` type**
```ts
export type GameState = 'LOBBY' | 'TOPIC_REVEAL' | 'QUESTION_ACTIVE' | 'QUESTION_RESULTS' | 'FINAL_LEADERBOARD';
```

## API Changes — `server/routes/quiz.ts`

### `POST /api/quizzes/:id/questions`
Add `topic` to the destructured body and include it in the Supabase insert (nullable).

### `PATCH /api/questions/:qid`
Add `'topic'` to the `allowed` array so it persists on save.

## Server Changes — `server.ts`

### `broadcastState()`
No change. `questions[currentQuestionIndex]` already passes the full DB row, so `topic` flows through automatically once the DB column exists.

### `start-game` handler
Replace direct transition to `QUESTION_ACTIVE` with:
1. If `questions[0].topic` is set → set `gameState = 'TOPIC_REVEAL'`, broadcast, then `setTimeout(startQuestion, 3000)`
2. If no topic → call `startQuestion()` immediately

Extract question-start logic into a shared `startQuestion()` function (sets `QUESTION_ACTIVE`, `questionStartTime`, resets player states, starts the question timer).

### `next-question` handler
Same pattern: check topic of the next question, go to `TOPIC_REVEAL` or directly to `startQuestion()`.

### `TOPIC_REVEAL` timeout
3 seconds (hardcoded constant `TOPIC_REVEAL_MS = 3000`).

## Builder UI — `QuestionCard.tsx`

Add a "Topic" row below the existing Time / Points row in the expanded card body:

```
label: "Topic"
pills: Maths | Riddles | Idioms | Rearrange Letters | General
```

- Tapping an unselected pill calls `onUpdate(question.id, { topic: value })`
- Tapping the already-selected pill calls `onUpdate(question.id, { topic: null })` (deselect)
- Active pill uses `bg-neon-blue text-black` (same as active time-limit pill)
- Topic summary shown in the collapsed card subtitle line alongside time/points/image indicators

## Topic Accent Colors (shared constant)

Define once (e.g. in a `src/lib/topics.ts` file) and import wherever needed:

```ts
export const TOPIC_META: Record<string, { label: string; color: string; bg: string }> = {
  maths:             { label: 'Maths',            color: 'text-cyan-300',   bg: 'bg-cyan-500/20 border-cyan-400/50' },
  riddles:           { label: 'Riddles',          color: 'text-violet-300', bg: 'bg-violet-500/20 border-violet-400/50' },
  idioms:            { label: 'Idioms',           color: 'text-amber-300',  bg: 'bg-amber-500/20 border-amber-400/50' },
  rearrange_letters: { label: 'Rearrange Letters',color: 'text-rose-300',   bg: 'bg-rose-500/20 border-rose-400/50' },
  general:           { label: 'General',          color: 'text-emerald-300',bg: 'bg-emerald-500/20 border-emerald-400/50' },
};
```

## Topic Reveal Screen

Shown in both `HostView` and `PlayerView` when `gameState === 'TOPIC_REVEAL'`.

Layout: full-screen centered card with:
- Large topic label (e.g. `RIDDLES`) in its accent color, large bold font
- Subtext: `"Get ready…"`
- 3-second numeric countdown (3 → 2 → 1), implemented with a simple `useEffect`/`setInterval` — the existing `CountdownTimer` is designed for question timers and isn't a fit here
- Background tinted with the topic's accent color at low opacity

## Topic Badge in Question Views

Shown in `HostView` (`QUESTION_ACTIVE`) and `PlayerView` (`QUESTION_ACTIVE`) when `question.topic` is set.

Renders above the question text as a small pill:
```
[ RIDDLES ]
```
Uses the topic's `color` and `bg` from `TOPIC_META`. Positioned between the header row and the question text `<h2>`.

## Files Changed

| File | Change |
|---|---|
| `db/migrations/002_add_question_topic.sql` | New — adds `topic` column |
| `src/lib/topics.ts` | New — `TOPIC_META` constant |
| `src/store.ts` | Add `topic` to `Question`; add `TOPIC_REVEAL` to `GameState` |
| `src/components/quiz/QuestionCard.tsx` | Add `topic` to `QuestionData`; add topic pills in expanded form |
| `server/routes/quiz.ts` | Add `topic` to POST insert and PATCH allowlist |
| `server.ts` | Add `TOPIC_REVEAL` state; extract `startQuestion()`; 3s reveal timer |
| `src/components/HostView.tsx` | Handle `TOPIC_REVEAL` state; add topic badge in `QUESTION_ACTIVE` |
| `src/components/PlayerView.tsx` | Handle `TOPIC_REVEAL` state; add topic badge in `QUESTION_ACTIVE` |
