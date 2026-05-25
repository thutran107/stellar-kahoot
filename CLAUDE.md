# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Dev server (Express + Vite HMR via tsx)
npm run build      # Production bundle to dist/
npm run start      # Production server (node --experimental-strip-types)
npm run lint       # Type check only (tsc --noEmit, no test suite yet)
npm run clean      # Remove dist/
```

Environment: copy `.env.local` with `PORT` (default 3000). Planned vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## Architecture

**StellarTrivia** is a real-time multiplayer quiz game (Kahoot-style) with a space theme.

### Stack

- **Backend:** `server.ts` — Express + Socket.io. Serves Vite in dev, `dist/` in prod. All game state lives in-memory on the server (plain Maps).
- **Frontend:** React 19 + React Router. Routes: `/` (Home), `/host` (HostView), `/join` (PlayerView), `/demo` (DemoPlayer).
- **State:** Zustand store in `src/store.ts` — holds client-side game state and manages the Socket.io connection. Single source of truth on the client.
- **Styling:** Tailwind CSS v4. Custom theme vars in `src/index.css` (neon colors, `.glass`, `.btn-funky`, `.orbit`). Fonts: Space Grotesk + JetBrains Mono (Google Fonts CDN).

### Real-time flow

1. Host calls `host-game` → server assigns a 4-digit PIN and game session
2. Players call `join-game` with the PIN → server assigns color/avatar, adds to session
3. Host drives the game: `start-game` → `show-results` → `next-question`
4. Server broadcasts `game-state-update` after every mutation so all clients stay in sync
5. Players submit via `submit-answer`; server scores on the spot (500–1000 pts, time-weighted)

### Planned (see `docs/superpowers/plans/2026-04-22-foundation-quiz-builder.md`)

Supabase PostgreSQL for persistent quiz storage, Supabase magic-link auth, drag-and-drop quiz builder (@dnd-kit), and Vitest + Supertest test suite. Dependencies are already in `package.json` but not yet wired up.
