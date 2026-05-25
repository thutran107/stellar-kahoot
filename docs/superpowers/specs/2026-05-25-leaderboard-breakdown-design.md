# Leaderboard Breakdown View

**Date:** 2026-05-25  
**Status:** Approved

## Summary

Add a togglable score breakdown table to the host's `FINAL_LEADERBOARD` screen. The table shows the top 5 players with per-question point details so the room can see exactly how scores were built up.

## Scope

- **Host view only** — displayed on the big screen at the end of the game
- **Toggle button** — host manually switches between the podium view and the breakdown table
- **Top 5 players** — only the top 5 (already sorted by score from the server)

Out of scope: player view changes, Supabase persistence of the breakdown, animations on the table cells.

## Data Layer

### Server (`server.ts`)

Add `scoreHistory: number[]` to the `Player` interface:

```ts
interface Player {
  // ...existing fields...
  scoreHistory: number[];  // points earned per question, in order
}
```

Initialize to `[]` when a player joins. In `triggerShowResults`, after the `forEach` loop that zeroes out non-answerers' `lastPointsEarned`, iterate all players and push each player's `lastPointsEarned` into their `scoreHistory`. This ensures unanswered questions record `0` correctly.

Include `scoreHistory` in the `broadcastState` payload — it is already included implicitly since `broadcastState` sends the full `players` array.

### Client (`store.ts`)

Add `scoreHistory: number[]` to the `Player` interface so TypeScript resolves it correctly on the frontend. No other store changes needed.

## UI

### Toggle

On the `FINAL_LEADERBOARD` section of `HostView.tsx`, add a local `showBreakdown` boolean state (default `false`). Add a "Show Breakdown" / "Hide Breakdown" button alongside the existing "Return to Base" button. The button uses the `glass` style.

When `showBreakdown` is `true`, the podium and player list are hidden and the `BreakdownTable` component is shown in their place. When `false`, the podium view is restored.

### `BreakdownTable` component

New inline component at the bottom of `HostView.tsx`. Props: `players: Player[]`, `totalQuestions: number`.

Renders a table where:
- **Rows**: top 5 players (rank, avatar + name, Q1…Qn columns, correct count, total score)
- **Columns**: one per question, labeled Q1, Q2, …, Qn
- **Cells**: points earned, colored by tier:
  - `1000` → `text-yellow-400` (gold)
  - `800` → `text-neon-blue` / cyan
  - `500` → `text-indigo-400`
  - `0` → `text-gray-600`, displayed as `—`
- **Summary columns**: correct count (e.g. `4/10`) and total score in neon-blue

Uses existing Tailwind classes consistent with the rest of the app (`glass`, `font-mono`, `rounded-xl`).

## Files Changed

| File | Change |
|------|--------|
| `server.ts` | Add `scoreHistory: number[]` to `Player` interface; initialize on join; push on `triggerShowResults` |
| `src/store.ts` | Add `scoreHistory: number[]` to `Player` interface |
| `src/components/HostView.tsx` | Add `showBreakdown` toggle state, "Show Breakdown" button, and `BreakdownTable` component |

## Acceptance Criteria

1. After a game ends, the `FINAL_LEADERBOARD` screen shows a "Show Breakdown" button.
2. Clicking it replaces the podium with a table showing the top 5 players.
3. Each row shows the player's points per question, their correct answer count, and their total score.
4. Clicking "Hide Breakdown" restores the podium.
5. Point tier colors match the spec (gold/cyan/indigo/muted).
6. Works for games of any length (1–N questions).
