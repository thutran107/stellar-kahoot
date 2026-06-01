# Leaderboard Per Question

**Date:** 2026-06-01  
**Status:** Approved

## Summary

Show a live leaderboard on the host's `QUESTION_RESULTS` screen after every question. The leaderboard is the default view; a "view answers" link lets the host peek at the answer distribution. Each row shows the player's points earned this round and their rank change (↑/↓/—) since the previous question.

## Scope

- **Host view only** — displayed on the big screen after each question
- **Top 5 players** — up to 5, sorted by current total score descending; shows all players if fewer than 5 are in the game
- **Leaderboard-first** — leaderboard renders by default; "view answers" toggles to the existing answer distribution; "hide answers" toggles back
- **Rank changes** — derived client-side from existing `scoreHistory` data; no server changes required

Out of scope: player view changes, animations on row transitions, persisting rank-change data.

## Data Layer

No server changes needed. All required data is already present on the client:

- `player.score` — current total score
- `player.scoreHistory` — array of points earned per question, pushed after each `show-results`

**Points earned this round:**
```ts
const pointsThisRound = p.scoreHistory.at(-1) ?? 0;
```
Display as `+N` (green) if `N > 0`, or `—` (gray) if `N === 0`.

**Rank delta computation:**
```ts
// Score before this question
const prevScore = (p: Player) => p.score - (p.scoreHistory.at(-1) ?? 0);

// Previous ranking: sort by prevScore descending
const prevRanking = [...players].sort((a, b) => prevScore(b) - prevScore(a));
const prevRankMap = new Map(prevRanking.map((p, i) => [p.id, i]));

// Current ranking: players array is already sorted by score descending
const rankDelta = (p: Player, currentIdx: number): 'up' | 'down' | 'same' => {
  const prev = prevRankMap.get(p.id) ?? currentIdx;
  if (currentIdx < prev) return 'up';
  if (currentIdx > prev) return 'down';
  return 'same';
};
```

**Edge case — Q1:** On the first question all `prevScore` values are 0, so all players tie in the previous ranking. All rank changes display as `—`.

## UI

### State

Add one local boolean to the `QUESTION_RESULTS` block of `HostView.tsx`:

```ts
const [showAnswers, setShowAnswers] = useState(false);
```

Reset to `false` whenever the game transitions back into `QUESTION_RESULTS` (i.e. on each new question) — achieved via a `useEffect` on `gameState`.

### Layout

When `showAnswers` is `false` (default), render the leaderboard in place of the answer distribution. When `true`, render the existing answer distribution. The toggle lives in the bottom-left of the fixed action bar alongside the existing "Next" button:

```
[ view answers ]                          [ ▶ NEXT ]
```

When answers are visible the link reads "hide answers".

### Leaderboard card

Renders inside a `glass` container, consistent with the rest of the host UI:

```
TOP PILOTS — AFTER Q{n}
─────────────────────────────────────────────
1  🚀  Nova     +950  ↑   2850 pts   ← gold left-border
2  ⭐  Orion    +800  —   2600 pts
3  🌙  Lyra      —   ↓   2100 pts
4  🪐  Cosmo   +1000  ↑   1900 pts
5  ☄️  Vega      —   —   1500 pts
```

**Column details:**

| Column | Content | Style |
|--------|---------|-------|
| Rank | 1–5 | `#facc15` for 1st, `#cd7c3e` for 3rd, `#94a3b8` otherwise |
| Avatar | `p.avatar` emoji in colored circle | `p.color` background |
| Name | `p.name` | `text-e2e8f0 font-semibold` |
| Points this round | `+N` or `—` | `text-neon-green` / `text-gray-500` |
| Rank change | `↑` / `↓` / `—` | `text-neon-green` / `text-red-500` / `text-gray-500` |
| Total score | `N pts` | `text-neon-blue font-mono font-bold` |

First-place row gets a subtle `border-l-2 border-yellow-400` and `bg-yellow-400/5` highlight.

### Reset on new question

```ts
useEffect(() => {
  setShowAnswers(false);
}, [gameState]);
```

This ensures the leaderboard view is always the default when a new `QUESTION_RESULTS` state begins.

## Files Changed

| File | Change |
|------|--------|
| `src/components/HostView.tsx` | Add `showAnswers` state, rank-delta helper logic, leaderboard card JSX, "view answers" toggle link |

## Acceptance Criteria

1. After each question, the `QUESTION_RESULTS` screen shows the leaderboard by default (not the answer distribution).
2. The leaderboard shows the top 5 players sorted by current score.
3. Each row displays points earned this round (+N or —) and a rank change indicator (↑/↓/—).
4. Clicking "view answers" switches to the existing answer distribution view.
5. Clicking "hide answers" returns to the leaderboard.
6. On question 1, all rank changes show `—`.
7. The leaderboard resets to default view when the next question's results appear.
8. The "Next" button remains visible and functional in both views.
