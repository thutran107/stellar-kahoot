<div align="center">
<img width="1200" height="475" alt="StellarTrivia Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# StellarTrivia

A real-time multiplayer quiz game with a space theme — host a game, share a PIN, and let players compete from any device. Built in the style of Kahoot.

## Features

- **Live multiplayer** — Socket.io keeps all players in sync in real time
- **Quiz builder** — create and edit quizzes with multiple-choice questions, time limits, and point multipliers
- **Auto-advance timer** — questions automatically reveal results when time runs out; host can end early
- **Vote stats** — per-option bar charts show how players voted after each question
- **Results history** — browse past game sessions with final scores and per-question breakdowns
- **Magic-link auth** — Supabase email auth, no passwords

## Stack

- **Backend** — Express + Socket.io, TypeScript
- **Frontend** — React 19, React Router, Zustand, Tailwind CSS v4
- **Database / Auth** — Supabase (PostgreSQL + magic-link auth)
- **Build** — Vite

## Run Locally

**Prerequisites:** Node.js 20+, a [Supabase](https://supabase.com) project

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the environment file and fill in your Supabase credentials:
   ```bash
   cp .env.example .env.local
   ```

   | Variable | Description |
   |---|---|
   | `VITE_SUPABASE_URL` | Your Supabase project URL |
   | `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key |
   | `SUPABASE_URL` | Same project URL (server-side) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (bypasses RLS) |
   | `PORT` | Port to run on (default `3001`) |

3. Start the dev server:
   ```bash
   npm run dev
   ```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server with hot reload (Express + Vite HMR) |
| `npm run build` | Production bundle to `dist/` |
| `npm run start` | Production server |
| `npm run lint` | TypeScript type check |

## Deploy with Dokploy

A `Dockerfile` is included for production deployment.

### 1. Create the app in Dokploy

- Build type: `Dockerfile`
- Port: `3001`
- Replicas: `1` (game state is in-memory — do not scale horizontally)
- Enable **WebSocket support** in the domain proxy settings

### 2. Set build arguments

These are baked into the frontend bundle by Vite at build time:

| Build Arg | Value |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key |

### 3. Set environment variables

| Variable | Value |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `PORT` | `3001` |
| `CORS_ORIGIN` | Your production domain (e.g. `https://yourdomain.com`) |

### 4. Configure Supabase for production

In your Supabase project → **Authentication → URL Configuration**:
- Set **Site URL** to your production domain
- Add your production domain to **Redirect URLs**

Magic-link login will not work until this is done.

### 5. Run the RLS migration

In Supabase → **SQL Editor**, run the contents of `db/migrations/001_rls_game_tables.sql` if you haven't already.

---

## How to Play

1. Sign in and create a quiz at `/quizzes`
2. Click **Play** to host a game — a 4-digit PIN is generated
3. Players join at `/join` and enter the PIN
4. Host starts the game; questions auto-advance when time runs out
5. View past sessions and scores at `/games`
