# PIN Join — No Auth for Players

**Date:** 2026-05-14  
**Status:** Approved

## Problem

Players are blocked at `/join` by a Google sign-in redirect. Root cause: `App.tsx` calls `useAuthStore.init()` globally, which triggers Supabase's PKCE/OAuth callback handler on every page load — including unauthenticated routes. This can fire a redirect to `/login` before `PlayerView` renders.

Additionally, the server only supports a single concurrent game (module-level state), and the host lobby lacks a QR code for mobile join.

## Goals

1. Players can join any active game using only a 6-digit PIN and a nickname — no account, no auth.
2. Players can scan a QR code on the host screen to open the join URL directly.
3. Multiple games can run concurrently on the same server.
4. Existing host auth (Google via Supabase) is unchanged.

## Non-Goals

- Redis or persistent session storage (in-memory is sufficient)
- REST session endpoints (WebSocket-only flow is retained)
- Player accounts or cross-session identity
- Horizontal scaling

---

## Architecture

### Auth Barrier Fix

Move `init()` out of `App.tsx` into an `<AuthGate>` component that only wraps authenticated routes. `PlayerView` and `/join` never import or call into the auth store.

**Before:**
```
App.tsx — calls init() on every page load
  /join → PlayerView  ← gets Supabase PKCE handler fired anyway
```

**After:**
```
App.tsx — no auth calls
  /join → PlayerView         (no Supabase contact)
  /demo → DemoPlayer         (no Supabase contact)
  <AuthGate> — calls init(), wraps only:
    /host
    /quizzes
    /quizzes/:id/edit
    /games
    /games/:id
```

`AuthGate` is a thin wrapper component:
```tsx
function AuthGate({ children }: { children: React.ReactNode }) {
  const init = useAuthStore((s) => s.init);
  useEffect(() => { init(); }, [init]);
  return <>{children}</>;
}
```

The existing `RequireAuth` (redirect-on-no-user) is unchanged and still wraps each protected route inside `AuthGate`.

---

### Multi-Session Server

Replace module-level game state in `server.ts` with a `Map<string, GameSession>`.

**`GameSession` shape:**
```ts
interface GameSession {
  pin: string;
  hostSocketId: string;
  state: 'LOBBY' | 'QUESTION_ACTIVE' | 'QUESTION_RESULTS' | 'FINAL_LEADERBOARD';
  players: Record<string, Player>;
  questions: Question[];
  currentQuestionIndex: number;
  questionStartTime: number;
  questionTimer: ReturnType<typeof setTimeout> | null;
  answerCounts: number[];
  correctAnswerCount: number;
  dbSessionId: string | null;
  dbParticipantIds: Record<string, string>;
}

const sessions = new Map<string, GameSession>();
```

**PIN generation — 6-digit, collision-checked:**
```ts
function generatePin(): string {
  let pin: string;
  do {
    pin = Math.floor(100000 + Math.random() * 900000).toString();
  } while (sessions.has(pin));
  return pin;
}
```

**Session lifecycle:**
- Created: when host emits `host-game`
- Cleaned up: `sessions.delete(pin)` fires 5 minutes after `FINAL_LEADERBOARD` is reached, or immediately when the host socket disconnects mid-game. The 5-minute grace period lets players see the final screen before the session is removed.

**Socket event changes:**
All existing events (`host-game`, `join-game`, `start-game`, `show-results`, `next-question`, `submit-answer`) are unchanged from the client's perspective. Server handlers now look up `sessions.get(pin)` instead of reading module-level variables.

Each handler that was `socket.id !== gameHostSocketId` becomes `session.hostSocketId !== socket.id`. Each `broadcastState()` call becomes `broadcastState(session)` scoped to that session's sockets.

**`broadcastState` scoping:**
Instead of `io.emit(...)` (broadcasts to all connected clients), use `io.to(session.pin).emit(...)`. Each socket joins a Socket.io room named by PIN on `host-game` / `join-game`.

---

### QR Code on Host Screen

**Dependency:** `qrcode.react` (client-side, no server change).

```bash
npm install qrcode.react
```

In `HostView`, in the lobby panel alongside the PIN display:

```tsx
import { QRCodeSVG } from 'qrcode.react';

<QRCodeSVG
  value={`${window.location.origin}/join?pin=${gamePin}`}
  size={180}
  bgColor="transparent"
  fgColor="#ffffff"
/>
```

The join URL (`/join?pin=XXXXXX`) already works — `PlayerView` reads `searchParams.get('pin')` and pre-fills the PIN input.

---

## Data Flow (Happy Path)

```
Host                        Server                      Player
 |                            |                            |
 |── host-game ──────────────>|                            |
 |                            | creates GameSession        |
 |                            | generates 6-digit PIN      |
 |<── host-joined { pin } ────|                            |
 | renders QR(origin/join?pin)|                            |
 |                            |   [player scans QR]        |
 |                            |<── join-game { pin, name } |
 |                            | adds player to session     |
 |                            |── join-success ───────────>|
 |<── game-state-update ──────|── game-state-update ──────>|
 |                            |                            |
 |── start-game ─────────────>|                            |
 |<── game-state-update ──────|── game-state-update ──────>|
```

---

## Files Changed

| File | Change |
|---|---|
| `src/App.tsx` | Remove `init()` call; add `<AuthGate>` wrapper around protected routes |
| `src/components/auth/AuthGate.tsx` | New component — calls `init()`, renders children |
| `server.ts` | Replace module-level state with `Map<string, GameSession>`; scope broadcasts to rooms |
| `src/components/HostView.tsx` | Add `QRCodeSVG` to lobby panel |
| `package.json` | Add `qrcode.react` |

No changes to: `RequireAuth`, `authStore`, `store.ts`, `PlayerView`, `LoginPage`.

---

## Error Cases

| Scenario | Behaviour |
|---|---|
| Player enters wrong PIN | Server emits `join-error: "Invalid PIN or game not found"` — same as today |
| Player joins after game started | Server emits `join-error: "Game already in progress"` — same as today |
| Host disconnects mid-game | Session is deleted immediately; remaining players see "Game ended" via `game-ended` event |
| Two hosts generate same PIN | Collision loop in `generatePin()` retries until unique |
