# Screen Enhancement

**Date:** 2026-05-18
**Branch:** `feat/screen-enhancement`
**Status:** Approved

## Problem

The host view is difficult to read when projected on a large TV or LED screen during an in-person event. Text is small, the timer is only a thin 2px progress bar, and there is no numeric countdown visible to either the host or players. Players on phones also have no visual time indicator during active questions.

## Goals

1. Players see a numeric countdown timer on their phones during active questions.
2. Players see a full-width Kahoot-style progress bar below the answer options that fills from full to empty over the question duration, shifting color from neutral to red as time runs low.
3. Hosts see a numeric countdown timer on the host screen during active questions.
4. A "Big Screen Mode" transforms the host view for projection — dramatically larger text, LED-display aesthetic on timer digits and leaderboard scores, `vw/vh`-relative sizing that fills any resolution (1080p, 4K, etc.).
5. Big Screen Mode is toggled by a button in the lobby before the game starts.
6. Normal mode is completely unchanged.

## Non-Goals

- Global font size changes to normal mode
- Player view LED styling (phones stay compact)
- Server changes (all required data already exists)
- Persisting the big-screen preference across sessions
- Correcting client-side timer drift — `requestAnimationFrame` countdown is a display approximation only; the server's `questionStartTime` timestamp is the source of truth and state transitions (end of question) are server-driven. Minor visual drift (±1s) is expected and acceptable.

---

## Architecture

### CountdownTimer Component

New shared component `src/components/CountdownTimer.tsx`. Used in both `HostView` and `PlayerView`.

Derives remaining time from `questionStartTime` and `question.timeLimit` already in the Zustand store. Uses `requestAnimationFrame` (same pattern as the existing `TimerBar`) updating every ~100ms.

**Props:**
```ts
interface CountdownTimerProps {
  startTime: number;
  timeLimit: number;
  className?: string;
}
```

**Behavior:**
- Displays integer seconds remaining (e.g. `"15"`)
- Color shifts cyan → rose as time runs low (threshold: 30% remaining), matching existing `TimerBar` colors
- Stops at `0` — no negative values
- R `null` when `startTime` is 0 or `timeLimit` is 0

**Normal mode appearance:** Compact pill — `"15s"` in JetBrains Mono, ~`text-2xl`, with a soft neon glow border.

**Big-screen mode appearance:** Activated by inheriting the `.big-screen` ancestor class. Large digit block in JetBrains Mono at `~8vw` font size. Full 4-layer `text-shadow` LED glow (see below). Switches cyan/rose on the same 30% threshold.

The existing `TimerBar` (thin absolute progress bar at the top of the host screen) is kept as-is alongside the new `CountdownTimer`.

---

### PlayerProgressBar Component

New component `src/components/PlayerProgressBar.tsx` — a full-width horizontal progress bar for the player view only.

**Props:**
```ts
interface PlayerProgressBarProps {
  startTime: number;
  timeLimit: number;
}
```

**Behavior:**
- Spans 100% of the screen width
- Fills from left to right, depleting from full → empty over the question duration
- Color transitions: neutral (white/cyan) → red as time runs low (threshold: 30% rem- Uses `requestAnimationFrame` for smooth animation
- Returns `null` when `startTime` is 0 or `timeLimit` is 0

**Placement in PlayerView:** Below the answer options grid, above the player name/score strip at the bottom. Not absolute-positioned — sits in the normal document flow so it doesn't overlap content.

**Visual spec:**
- Height: `h-3` (12px) — prominent enough to register on a phone without being distracting
- Rounded ends: `rounded-full`
- Background track: `bg-white/10`
- Fill color: `#22d3ee` (cyan) when above 30%, transitions to `#f43f5e` (rose/red) below 30%
- Subtle glow matching the fill color via `box-shadow`

This is visually distinct from the existing host `TimerBar` (which is `h-2`, absolute, pinned to the very top of the screen). The two components serve the same data but have different layout roles.

---

### Big Screen Mode Toggle

`HostView` gains a `bigScreen: boolean` local state (default `false`). A toggle button in the lobby panel switches it. Once the game starts the button is removed via conditional rendering — mode is locked for the session.

```tsx
const [bigScreen, setBigScreen] = useState(false);
```

```tsx
{!gameStarted && (
  <button onClick={() => setBigScreen(b => !b)}>
    {bigScreen ? 'Exit Big Screen' : 'Big Screen Mode'}
  </button>
)}
```

When `bigScreen` is true, a `big-screen` CSS class is added to the `HostView` root `div`:

```tsx
<div className={bigScreen ? 'big-screen' : ''}>
```

All big-screen visual changes are scoped to `.big-screen` descendants in `src/index.css` — no conditional rendering beyond the toggle button itself, no prop drilling.

---

### Big Screen Mode — Visual Spec

Activated by `.big-screen` on the `HostView` root. All sizing uses `vw`/`vh` units so it scales to any TV or projector resolution.

| Element | Normal mode | Big-screen mode |
|---|---|---|
| Question text | `text-2xl` | `~5vw`, white with a single subtle `text-shadow` for depth |
| Answer option labels | `text-lg` | `~2.5vw` |
| CountdownTimer digit | `text-2xl` pill | `~8vw`, full LED glow (cyan/rose) |
| Player count / status | `text-sm` | `~1.5vw` |
| Leaderboard scores | `text-xl` | `~3vw`, JetBrains Mono, full LED glow |
| Vote bars / counts | compact rows | taller , `~2vw` count labels |

**Font loading:** JetBrains Mono is already loaded via Google Fonts CDN in `index.html` (`<link rel="preconnect">` + `<link href="...">` with `display=swap`). The fallback stack for all `.led-digit` and `.big-screen` mono elements is `'JetBrains Mono', 'Courier New', Courier, monospace` — `Courier New` is universally available and preserves fixed-width layout if the web font fails.

**LED glow technique** — applied to `CountdownTimer` digits and leaderboard score numbers only:
```css
.big-screen .led-digit {
  font-family: 'JetBrains Mono', 'Courier New', Courier, monospace;
  text-shadow:
    0 0 7px currentColor,
    0 0 10px currentColor,
    0 0 21px currentColor,
    0 0 42px currentColor;
}
```

**Question text shadow** — single subtle shadow for depth, no glow stack (avoids bleed/blur on projectors):
```css
.big-screen .question-text {
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
}
```

**TimerBar in big-screen mode** — the existing host `TimerBar` is `h-2` (2px) in normal mode, which is invisible on a 4K display. Override it to `1vh` so it remains visible at any resolution without altering the normal-mode component:
```css
.big-screen .timer-bar {
  height: 1vh;
}
```
(`PlayerProgressBar` is player-view only and is unaffected by `.big-screen`.)

---

### PlayerView Changes

During `QUESTION_ACTIVE` state, `PlayerView` renders two new elements:

1. `<CountdownTimer>` — numeric seconds remaining, above the answer choices, centered.
2. `<PlayerProgressBar>` — full-width bar, below the answer choices grid, above the player name/score strip.

Both use `questionStartTime` and `question.timeLimit` already in the Zustand store.

---

## Data Flow

No changes to the server or store. All required fields (`questionStartTime`, `question.tim are already broadcast via `game-state-update` and stored in the Zustand store.

```
Server → game-state-update { questionStartTime, ... }
  ↓
Zustand store (questionStartTime already there)
  ↓
CountdownTimer / PlayerProgressBar read questionStartTime + question.timeLimit
  → derive secondsRemaining / progress% via requestAnimationFrame
  → render digit / bar + apply color threshold at 30%
```

---

## Files Changed

| File | Change |
|---|---|
| `src/components/CountdownTimer.tsx` | New — shared numeric countdown component |
| `src/components/PlayerProgressBar.tsx` | New — full-width progress bar for player view |
| `src/components/HostView.tsx` | Add `bigScreen` state + toggle button in lobby; add `.big-screen` class to root; render `CountdownTimer` during active question |
| `src/components/PlayerView.tsx` | Render `CountdownTimer` above answers and `PlayerProgressBar` below answers during `QUESTION_ACTIVE` |
| `src/index.css` | Add `.big-screen` scoped CSS — `vw/vh` font overrides, LED git`, subtle shadow on `.question-text` |

No changes to: `server.ts`, `store.ts`, `App.tsx`, `authStore`, or any routing/auth files.

---

## Error Cases

| Scenario | Behaviour |
|---|---|
| `questionStartTime` is 0 (not yet started) | Both `CountdownTimer` and `PlayerProgressBar` return `null` — guard: `if (!startTime \|\| !timeLimit) return null` |
| Timer reaches 0 before server ends question | Display holds at `"0"` / bar holds at empty — server is authoritative on state transitions |
| Big screen toggled but game already started | Button is hidden once game starts; mode cannot change mid-game |
