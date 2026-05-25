# Audio System Design

**Date:** 2026-05-20
**Branch:** background-music-enhancements
**Status:** Approved

---

## Overview

Add background music and sound effects to StellarTrivia that react to game state transitions. All audio is hosted locally in `public/audio/`. Playback is managed by a single Howler.js-powered hook mounted at the `App` level.

---

## Audio Assets

All files are CC0 / royalty-free, no attribution required. Downloaded to `public/audio/`.

| File | Source | Duration | Role |
|---|---|---|---|
| `lobby.ogg` | Kenney — Night at the Beach | 10.75s | Lobby waiting loop |
| `ambient.ogg` | Kenney — Flowing Rocks | 30.75s | Question reading ambient loop |
| `countdown.ogg` | Kenney — Mission Plausible | 10.5s | Countdown normal loop |
| `urgent.ogg` | Kenney — Drumming Sticks | 14.75s | Countdown urgent loop (≤5s) |
| `timesup.ogg` | Kenney — jingles-hit_04 | 0.61s | Time's up one-shot sting |
| `correct.mp3` | Mixkit — Correct answer tone #2870 | 1.96s | Correct answer reveal one-shot |
| `fanfare.ogg` | Kenney — Serious ident | 5.28s | Win fanfare one-shot |
| `podium.ogg` | Kenney — Space Cadet | 24.16s | Final leaderboard loop |

---

## Architecture

### Files

- `src/lib/audioManager.ts` — instantiates all `Howl` objects, exports `fadeIn`, `fadeOut`, `crossfade`, `play`, `stopAll`
- `src/hooks/useAudioManager.ts` — React hook, watches `useGameStore`, calls `audioManager` on state transitions
- `public/audio/` — static audio assets served by Vite/Express

### Mounting point

`useAudioManager()` is called once in `App.tsx`. Both `HostView` and `PlayerView` share the same audio instance — no duplication, no desync.

### Howler initialisation

All loop tracks are instantiated at `volume: 0` to allow smooth fade-in without an audible pop on load:

```ts
const lobby = new Howl({ src: ['/audio/lobby.ogg'], loop: true, volume: 0 });
```

One-shot stings are instantiated at `volume: 1`:

```ts
const timesup = new Howl({ src: ['/audio/timesup.ogg'], loop: false, volume: 1 });
```

---

## State → Audio Mapping

The hook tracks previous `gameState` via `useRef` to detect transitions.

| Transition | Audio action |
|---|---|
| Any → `LOBBY` | `fadeIn(lobby)` |
| `LOBBY` → `TOPIC_REVEAL` | `crossfade(lobby, ambient)` |
| `TOPIC_REVEAL` → `QUESTION_ACTIVE` | `crossfade(ambient, countdown)` + schedule urgent crossfade |
| ≤5s remaining (during `QUESTION_ACTIVE`) | `crossfade(countdown, urgent)` via `setTimeout` |
| `QUESTION_ACTIVE` → `QUESTION_RESULTS` | `stopAll()` → `play(timesup)` → `play(correct)` after 1000ms |
| `QUESTION_RESULTS` → `QUESTION_ACTIVE` | `fadeIn(countdown)` (ambient already stopped; next question) |
| Any → `FINAL_LEADERBOARD` | `stopAll()` → `play(fanfare, { onend: () => fadeIn(podium) })` |

### Urgent countdown scheduling

When `QUESTION_ACTIVE` starts, a single `setTimeout` is scheduled:

```ts
const delay = questionStartTime + timeLimit - 5000 - Date.now();
if (delay > 0) {
  urgentTimerRef.current = setTimeout(() => crossfade('countdown', 'urgent'), delay);
}
```

The timer ref is cleared on cleanup (`return () => clearTimeout(urgentTimerRef.current)`) so it doesn't fire if the host ends the question early.

### Win fanfare → podium transition

Howler's `onend` callback chains the fanfare into the podium loop:

```ts
play('fanfare', { onend: () => fadeIn('podium') });
```

The leaderboard shows top 5 simultaneously — a single generic fanfare plays for all clients.

---

## Mute Control

- Global mute toggle stored in local state in `App.tsx`
- `Howler.volume(0)` / `Howler.volume(1)` — silences/restores all sounds globally
- UI: small 🔊/🔇 button, top-right corner, visible on both `HostView` and `PlayerView`
- Mid-fade muting is safe — Howler's internal fade completes silently with no audible glitch on unmute

---

## Browser Autoplay

Browsers block audio until a user gesture occurs. Howler handles the unlock automatically on the first interaction (join button click, host button click). No manual unlock code needed.

---

## Fade / Crossfade Parameters

| Operation | Duration |
|---|---|
| `fadeIn` | 500ms |
| `fadeOut` | 500ms |
| `crossfade` | 500ms overlap (fade out A while fading in B simultaneously) |

---

## Known Limitations

- `correct.mp3` is a Mixkit preview file (96kbps). Acceptable for now; swap for full-quality WAV if audio fidelity becomes a concern.
- Loop tracks (lobby, countdown, urgent, podium) are not perfectly seamless — Kenney loops have a natural loop point but Howler may introduce a small gap on repeat. If noticeable, use Howler's `sprite` feature to trim the loop point.

