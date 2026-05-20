# Background Music Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reactive background music and sound effects to StellarTrivia using Howler.js, driven by game state transitions.

**Architecture:** A singleton `audioManager` owns all Howler instances and exposes `fadeIn`, `fadeOut`, `crossfade`, `play`, and `stopAll`. A React hook `useAudioManager` watches `useGameStore` and calls the manager on state changes. The hook is mounted once in `App.tsx` so both HostView and PlayerView share the same audio instance.

**Tech Stack:** Howler.js 2.x, React 19, Zustand, TypeScript, Vite

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `src/lib/audioManager.ts` | Howler instances + playback control functions |
| Create | `src/hooks/useAudioManager.ts` | React hook — maps game state to audio actions |
| Modify | `src/App.tsx` | Mount hook, add mute toggle button |
| Modify | `package.json` | Add `howler` + `@types/howler` |

Audio assets are already in `public/audio/` — no changes needed there.

---

## Task 1: Install Howler.js

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install howler and its types**

```bash
npm install howler
npm install -D @types/howler
```

- [ ] **Step 2: Verify no type errors**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add howler.js for audio playback"
```

---

## Task 2: Create audioManager

**Files:**
- Create: `src/lib/audioManager.ts`

- [ ] **Step 1: Create the file with all Howl instances and control functions**

```ts
import { Howl, Howler } from 'howler';

const FADE_MS = 500;

const sounds = {
  lobby:     new Howl({ src: ['/audio/lobby.ogg'],     loop: true,  volume: 0 }),
  ambient:   new Howl({ src: ['/audio/ambient.ogg'],   loop: true,  volume: 0 }),
  countdown: new Howl({ src: ['/audio/countdown.ogg'], loop: true,  volume: 0 }),
  urgent:    new Howl({ src: ['/audio/urgent.ogg'],    loop: true,  volume: 0 }),
  timesup:   new Howl({ src: ['/audio/timesup.ogg'],   loop: false, volume: 1 }),
  correct:   new Howl({ src: ['/audio/correct.mp3'],   loop: false, volume: 1 }),
  fanfare:   new Howl({ src: ['/audio/fanfare.ogg'],   loop: false, volume: 1 }),
  podium:    new Howl({ src: ['/audio/podium.ogg'],    loop: true,  volume: 0 }),
};

export type SoundKey = keyof typeof sounds;

export function fadeIn(key: SoundKey, duration = FADE_MS) {
  const sound = sounds[key];
  if (!sound.playing()) sound.play();
  sound.fade(sound.volume(), 1, duration);
}

export function fadeOut(key: SoundKey, duration = FADE_MS) {
  const sound = sounds[key];
  sound.fade(sound.volume(), 0, duration);
  setTimeout(() => sound.stop(), duration + 50);
}

export function crossfade(from: SoundKey, to: SoundKey, duration = FADE_MS) {
  fadeOut(from, duration);
  fadeIn(to, duration);
}

export function play(key: SoundKey, onend?: () => void) {
  const sound = sounds[key];
  sound.off('end');
  if (onend) sound.once('end', onend);
  sound.play();
}

export function stopAll(duration = 100) {
  Object.values(sounds).forEach(sound => {
    if (sound.playing()) {
      sound.fade(sound.volume(), 0, duration);
      setTimeout(() => sound.stop(), duration + 50);
    }
  });
}

export function setGlobalMute(muted: boolean) {
  Howler.volume(muted ? 0 : 1);
}
```

- [ ] **Step 2: Verify no type errors**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/audioManager.ts
git commit -m "feat: add audioManager with Howler instances and control functions"
```

---

## Task 3: Create useAudioManager hook

**Files:**
- Create: `src/hooks/useAudioManager.ts`

- [ ] **Step 1: Create the hook**

```ts
import { useEffect, useRef } from 'react';
import { useGameStore, GameState } from '../store';
import { fadeIn, crossfade, play, stopAll } from '../lib/audioManager';

export function useAudioManager() {
  const gameState = useGameStore(s => s.gameState);
  const questionStartTime = useGameStore(s => s.questionStartTime);
  const question = useGameStore(s => s.question);

  const prevStateRef = useRef<GameState>('LOBBY');
  const urgentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = gameState;

    if (gameState === 'LOBBY') {
      stopAll();
      fadeIn('lobby');
      return;
    }

    if (gameState === 'TOPIC_REVEAL') {
      crossfade('lobby', 'ambient');
      return;
    }

    if (gameState === 'QUESTION_ACTIVE') {
      if (prev === 'TOPIC_REVEAL') {
        crossfade('ambient', 'countdown');
      } else {
        // subsequent questions — ambient already stopped
        fadeIn('countdown');
      }

      // schedule crossfade to urgent at ≤5s remaining
      if (question?.timeLimit && questionStartTime) {
        const delay = questionStartTime + question.timeLimit - 5000 - Date.now();
        if (delay > 0) {
          urgentTimerRef.current = setTimeout(() => {
            crossfade('countdown', 'urgent');
          }, delay);
        }
      }
      return;
    }

    if (prev === 'QUESTION_ACTIVE' && gameState === 'QUESTION_RESULTS') {
      if (urgentTimerRef.current) clearTimeout(urgentTimerRef.current);
      stopAll();
      play('timesup');
      setTimeout(() => play('correct'), 1000);
      return;
    }

    if (gameState === 'FINAL_LEADERBOARD') {
      stopAll();
      play('fanfare', () => fadeIn('podium'));
      return;
    }
  }, [gameState, questionStartTime, question?.timeLimit]);

  // cancel urgent timer on unmount
  useEffect(() => {
    return () => {
      if (urgentTimerRef.current) clearTimeout(urgentTimerRef.current);
    };
  }, []);
}
```

- [ ] **Step 2: Verify no type errors**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAudioManager.ts
git commit -m "feat: add useAudioManager hook wired to game state transitions"
```

---

## Task 4: Mount hook and add mute toggle in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update App.tsx**

Replace the entire file with:

```tsx
import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Howler } from 'howler';
import { Home } from './components/Home';
import { HostView } from './components/HostView';
import { PlayerView } from './components/PlayerView';
import { CosmicBackground } from './components/CosmicBackground';
import { DemoPlayer } from './components/DemoPlayer';
import { LoginPage } from './components/auth/LoginPage';
import { RequireAuth } from './components/auth/RequireAuth';
import { AuthGate } from './components/auth/AuthGate';
import { QuizListPage } from './components/quiz/QuizListPage';
import { QuizBuilderPage } from './components/quiz/QuizBuilderPage';
import { GameHistoryPage } from './components/games/GameHistoryPage';
import { GameDetailPage } from './components/games/GameDetailPage';
import { useAudioManager } from './hooks/useAudioManager';
import { useGameStore } from './store';

function AudioController() {
  const [muted, setMuted] = useState(false);
  const gamePin = useGameStore(s => s.gamePin);
  useAudioManager();

  if (!gamePin) return null;

  return (
    <button
      onClick={() => {
        const next = !muted;
        setMuted(next);
        Howler.volume(next ? 0 : 1);
      }}
      className="fixed top-4 right-4 z-50 glass px-3 py-2 rounded-full text-lg leading-none"
      aria-label={muted ? 'Unmute' : 'Mute'}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}

export default function App() {
  return (
    <Router>
      <div className="relative min-h-screen overflow-hidden">
        <CosmicBackground />
        <div className="orbit w-[1200px] h-[1200px] -top-[400px] left-1/2 -translate-x-1/2"></div>
        <div className="orbit w-[800px] h-[800px] -top-[200px] left-1/2 -translate-x-1/2"></div>

        <div className="relative z-10 min-h-screen flex flex-col">
          <AudioController />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/join" element={<PlayerView />} />
            <Route path="/demo" element={<DemoPlayer />} />
            <Route path="/quizzes" element={<AuthGate><RequireAuth><QuizListPage /></RequireAuth></AuthGate>} />
            <Route path="/quizzes/:id/edit" element={<AuthGate><RequireAuth><QuizBuilderPage /></RequireAuth></AuthGate>} />
            <Route path="/games" element={<AuthGate><RequireAuth><GameHistoryPage /></RequireAuth></AuthGate>} />
            <Route path="/games/:id" element={<AuthGate><RequireAuth><GameDetailPage /></RequireAuth></AuthGate>} />
            <Route path="/host" element={<AuthGate><RequireAuth><HostView /></RequireAuth></AuthGate>} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}
```

- [ ] **Step 2: Verify no type errors**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: mount useAudioManager and add mute toggle"
```

---

## Task 5: Manual smoke test

**Files:** none

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Open `http://localhost:3000` in browser.

- [ ] **Step 2: Verify lobby audio**

Navigate to `/host`. Host a game. Expected: `lobby.ogg` (Night at the Beach) fades in. Mute button (🔊) appears top-right.

- [ ] **Step 3: Verify mute toggle**

Click 🔊. Expected: audio silences, button shows 🔇. Click again — audio resumes.

- [ ] **Step 4: Verify question ambient**

Click Start Game. Expected: `lobby.ogg` crossfades to `ambient.ogg` (Flowing Rocks) on TOPIC_REVEAL.

- [ ] **Step 5: Verify countdown**

On QUESTION_ACTIVE. Expected: `ambient.ogg` crossfades to `countdown.ogg` (Mission Plausible). With a question timer > 5s, at ≤5s remaining the track crossfades to `urgent.ogg` (Drumming Sticks).

- [ ] **Step 6: Verify time's up and correct reveal**

Click Show Results. Expected: all music stops, `timesup.ogg` plays (~0.6s), then `correct.mp3` plays ~1s later.

- [ ] **Step 7: Verify next question**

Click Next Question. Expected: `countdown.ogg` fades in (no ambient this time).

- [ ] **Step 8: Verify final leaderboard**

End the game. Expected: all music stops, `fanfare.ogg` (Serious ident, 5.3s) plays, then `podium.ogg` (Space Cadet) loops.

- [ ] **Step 9: Commit smoke test sign-off**

```bash
git commit --allow-empty -m "chore: audio smoke test passed"
```
