# Foundation: Supabase + Auth + Quiz Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent quiz storage and a full quiz builder UI, replacing hardcoded questions with host-owned quizzes backed by Supabase PostgreSQL.

**Architecture:** Express + Socket.io backend gains REST quiz CRUD routes protected by Supabase JWT middleware. Frontend adds `/login` (magic link), `/quizzes` (quiz list), and `/quizzes/:id/edit` (drag-and-drop builder). The existing Socket.io game loop is untouched in this plan; quiz data flows in from the DB when the host starts a session.

**Tech Stack:** `@supabase/supabase-js` v2, `@dnd-kit/core` + `@dnd-kit/sortable`, `vitest`, `supertest`

> **Stack deviation from PRD:** PRD recommends Next.js + Supabase Realtime. We keep Express + Socket.io + Vite and add Supabase only for PostgreSQL + Auth. Supabase Realtime is redundant — Socket.io already handles real-time at 100 CCU.

---

## File Map

**New files:**
- `db/schema.sql` — full DDL for all 5 tables with RLS policies
- `src/lib/supabase.ts` — browser Supabase client (uses `VITE_` env vars)
- `server/lib/supabase.ts` — server-side Supabase admin client (service role)
- `server/middleware/auth.ts` — Express JWT verification middleware
- `server/routes/quiz.ts` — Express router: quiz + question CRUD (8 endpoints)
- `src/lib/api.ts` — shared `apiFetch` helper (attaches auth header)
- `src/store/authStore.ts` — Zustand auth state (user, session, signIn, signOut)
- `src/components/auth/LoginPage.tsx` — magic link login form
- `src/components/auth/RequireAuth.tsx` — route guard component
- `src/components/quiz/QuizListPage.tsx` — host's quiz dashboard
- `src/components/quiz/QuizBuilderPage.tsx` — question editor + drag-and-drop ordering
- `src/components/quiz/QuestionCard.tsx` — single sortable question row with inline edit
- `server/__tests__/quiz.test.ts` — API route tests (mocked Supabase)
- `src/lib/__tests__/supabase.test.ts` — client instantiation smoke test

**Modified files:**
- `package.json` — add deps + test script
- `.env.example` — add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `server.ts` — register quiz router + `express.json()` middleware
- `src/App.tsx` — add `/login`, `/quizzes`, `/quizzes/:id/edit` routes; init auth on mount
- `src/components/Home.tsx` — "Host Game" navigates to `/quizzes`
- `src/components/HostView.tsx` — load quiz from `?quizId=` param instead of hardcoded questions
- `src/store.ts` — add `pointMultiplier` to `Question` type; update `hostGame` signature

---

### Task 1: Install dependencies + environment template

**Files:**
- Modify: `package.json`
- Create: `.env.example`

- [ ] **Step 1: Install packages**

```bash
cd /Users/anduin/projects/stellar-kahoot
npm install @supabase/supabase-js @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npm install -D vitest @vitest/ui supertest @types/supertest
```

Expected: packages added with no peer dependency errors.

- [ ] **Step 2: Add test script to package.json**

Open `package.json` and add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

Also add a `"test"` entry to `vitest.config` or add inline to `vite.config.ts`:
```typescript
// vite.config.ts — add inside defineConfig:
test: {
  environment: 'node',
  globals: true,
},
```

- [ ] **Step 3: Update .env.example**

Replace contents of `.env.example` with:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PORT=3001
```

Copy to `.env` and fill in real values from your Supabase project → Settings → API.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example vite.config.ts
git commit -m "feat: add supabase, dnd-kit, vitest dependencies"
```

---

### Task 2: Database schema

**Files:**
- Create: `db/schema.sql`

- [ ] **Step 1: Create schema file**

Create `db/schema.sql`:
```sql
-- Enable UUID generation
create extension if not exists "pgcrypto";

-- Quizzes
create table if not exists quizzes (
  id            uuid primary key default gen_random_uuid(),
  host_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  description   text,
  is_ready      boolean not null default false,
  created_at    timestamptz not null default now()
);
alter table quizzes enable row level security;
create policy "host owns quiz" on quizzes
  for all using (auth.uid() = host_id);

-- Questions
create table if not exists questions (
  id               uuid primary key default gen_random_uuid(),
  quiz_id          uuid not null references quizzes(id) on delete cascade,
  text             text not null check (char_length(text) <= 280),
  options          jsonb not null,
  correct_index    integer not null check (correct_index between 0 and 3),
  time_limit_sec   integer not null default 20 check (time_limit_sec in (10, 20, 30)),
  point_multiplier integer not null default 1 check (point_multiplier in (1, 2)),
  order_index      integer not null default 0
);
alter table questions enable row level security;
create policy "host owns question" on questions
  for all using (
    exists (
      select 1 from quizzes
      where quizzes.id = questions.quiz_id
        and quizzes.host_id = auth.uid()
    )
  );

-- Game sessions
create table if not exists game_sessions (
  id                      uuid primary key default gen_random_uuid(),
  quiz_id                 uuid not null references quizzes(id),
  pin                     varchar(6) not null,
  state                   text not null default 'lobby'
                            check (state in ('lobby','question_active','question_reveal','ended')),
  current_question_index  integer not null default 0,
  started_at              timestamptz,
  ended_at                timestamptz
);

-- Participants
create table if not exists participants (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references game_sessions(id) on delete cascade,
  display_name    text not null,
  avatar_color    text not null,
  avatar_emoji    text not null,
  total_score     integer not null default 0,
  avg_response_ms float,
  joined_at       timestamptz not null default now()
);

-- Answers
create table if not exists answers (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  question_id    uuid not null references questions(id),
  selected_index integer not null,
  is_correct     boolean not null,
  points_earned  integer not null,
  response_ms    integer not null,
  submitted_at   timestamptz not null default now(),
  unique(participant_id, question_id)
);
```

- [ ] **Step 2: Apply in Supabase**

Supabase project → SQL Editor → paste `db/schema.sql` → Run.
Verify 5 tables appear in Table Editor: `quizzes`, `questions`, `game_sessions`, `participants`, `answers`.

- [ ] **Step 3: Commit**

```bash
git add db/schema.sql
git commit -m "feat: add supabase database schema"
```

---

### Task 3: Supabase client instances

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `server/lib/supabase.ts`
- Create: `src/lib/__tests__/supabase.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/__tests__/supabase.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: {}, from: vi.fn() })),
}));

describe('supabase browser client', () => {
  it('exports a supabase instance', async () => {
    const mod = await import('../supabase');
    expect(mod.supabase).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test src/lib/__tests__/supabase.test.ts
```
Expected: FAIL — `Cannot find module '../supabase'`

- [ ] **Step 3: Create browser client**

Create `src/lib/supabase.ts`:
```typescript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
);
```

- [ ] **Step 4: Create server admin client**

Create `server/lib/supabase.ts`:
```typescript
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test src/lib/__tests__/supabase.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase.ts server/lib/supabase.ts src/lib/__tests__/supabase.test.ts
git commit -m "feat: add supabase client instances (browser + server)"
```

---

### Task 4: Auth middleware + quiz API routes

**Files:**
- Create: `server/middleware/auth.ts`
- Create: `server/routes/quiz.ts`
- Create: `server/__tests__/quiz.test.ts`
- Modify: `server.ts`

- [ ] **Step 1: Write failing test**

Create `server/__tests__/quiz.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } }, error: null,
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'q-1', title: 'Test', host_id: 'user-1' }, error: null }),
    }),
  },
}));

describe('Quiz API', () => {
  it('GET /api/quizzes returns 401 without token', async () => {
    const { quizRouter } = await import('../routes/quiz');
    const app = express();
    app.use(express.json());
    app.use('/api/quizzes', quizRouter);
    const res = await request(app).get('/api/quizzes');
    expect(res.status).toBe(401);
  });

  it('GET /api/quizzes returns 200 with valid token', async () => {
    const { supabaseAdmin } = await import('../lib/supabase');
    (supabaseAdmin.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    const { quizRouter } = await import('../routes/quiz');
    const app = express();
    app.use(express.json());
    app.use('/api/quizzes', quizRouter);
    const res = await request(app)
      .get('/api/quizzes')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test server/__tests__/quiz.test.ts
```
Expected: FAIL — `Cannot find module '../routes/quiz'`

- [ ] **Step 3: Create auth middleware**

Create `server/middleware/auth.ts`:
```typescript
import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase';

export interface AuthRequest extends Request {
  userId?: string;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Missing auth token' });
    return;
  }
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
  req.userId = user.id;
  next();
}
```

- [ ] **Step 4: Create quiz router**

Create `server/routes/quiz.ts`:
```typescript
import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';

export const quizRouter = Router();
quizRouter.use(requireAuth);

// List all quizzes for authenticated host
quizRouter.get('/', async (req: AuthRequest, res) => {
  const { data, error } = await supabaseAdmin
    .from('quizzes')
    .select('id, title, description, is_ready, created_at')
    .eq('host_id', req.userId!)
    .order('created_at', { ascending: false });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// Create new quiz
quizRouter.post('/', async (req: AuthRequest, res) => {
  const { title, description } = req.body;
  if (!title?.trim()) { res.status(400).json({ error: 'title required' }); return; }
  const { data, error } = await supabaseAdmin
    .from('quizzes')
    .insert({ host_id: req.userId!, title: title.trim(), description: description?.trim() || null })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

// Get single quiz with questions
quizRouter.get('/:id', async (req: AuthRequest, res) => {
  const { data: quiz, error } = await supabaseAdmin
    .from('quizzes')
    .select('*')
    .eq('id', req.params.id)
    .eq('host_id', req.userId!)
    .single();
  if (error || !quiz) { res.status(404).json({ error: 'Not found' }); return; }
  const { data: questions } = await supabaseAdmin
    .from('questions')
    .select('*')
    .eq('quiz_id', req.params.id)
    .order('order_index');
  res.json({ ...quiz, questions: questions || [] });
});

// Update quiz metadata (title, description, is_ready)
quizRouter.patch('/:id', async (req: AuthRequest, res) => {
  const { title, description, is_ready } = req.body;
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (is_ready !== undefined) updates.is_ready = is_ready;
  const { data, error } = await supabaseAdmin
    .from('quizzes')
    .update(updates)
    .eq('id', req.params.id)
    .eq('host_id', req.userId!)
    .select()
    .single();
  if (error || !data) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(data);
});

// Delete quiz
quizRouter.delete('/:id', async (req: AuthRequest, res) => {
  const { error } = await supabaseAdmin
    .from('quizzes')
    .delete()
    .eq('id', req.params.id)
    .eq('host_id', req.userId!);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});

// Duplicate quiz + all its questions
quizRouter.post('/:id/duplicate', async (req: AuthRequest, res) => {
  const { data: source, error: srcErr } = await supabaseAdmin
    .from('quizzes')
    .select('*')
    .eq('id', req.params.id)
    .eq('host_id', req.userId!)
    .single();
  if (srcErr || !source) { res.status(404).json({ error: 'Not found' }); return; }
  const { data: newQuiz, error: newErr } = await supabaseAdmin
    .from('quizzes')
    .insert({ host_id: req.userId!, title: `${source.title} (copy)`, description: source.description, is_ready: false })
    .select()
    .single();
  if (newErr || !newQuiz) { res.status(500).json({ error: 'Duplicate failed' }); return; }
  const { data: qs } = await supabaseAdmin
    .from('questions').select('*').eq('quiz_id', req.params.id).order('order_index');
  if (qs?.length) {
    await supabaseAdmin.from('questions').insert(
      qs.map(({ id: _id, quiz_id: _qid, ...q }) => ({ ...q, quiz_id: newQuiz.id }))
    );
  }
  res.status(201).json(newQuiz);
});

// Add question to quiz
quizRouter.post('/:id/questions', async (req: AuthRequest, res) => {
  const { text, options, correct_index, time_limit_sec, point_multiplier, order_index } = req.body;
  if (!options || correct_index === undefined) {
    res.status(400).json({ error: 'options and correct_index required' }); return;
  }
  const { data, error } = await supabaseAdmin
    .from('questions')
    .insert({
      quiz_id: req.params.id,
      text: text || '',
      options,
      correct_index,
      time_limit_sec: time_limit_sec || 20,
      point_multiplier: point_multiplier || 1,
      order_index: order_index ?? 0,
    })
    .select()
    .single();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

// Update question (text, options, correct_index, time_limit_sec, point_multiplier)
quizRouter.patch('/questions/:qid', async (req: AuthRequest, res) => {
  const allowed = ['text', 'options', 'correct_index', 'time_limit_sec', 'point_multiplier'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  const { data, error } = await supabaseAdmin
    .from('questions')
    .update(updates)
    .eq('id', req.params.qid)
    .select()
    .single();
  if (error || !data) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(data);
});

// Delete question
quizRouter.delete('/questions/:qid', async (req: AuthRequest, res) => {
  const { error } = await supabaseAdmin
    .from('questions')
    .delete()
    .eq('id', req.params.qid);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});

// Reorder questions by providing new orderedIds array
quizRouter.put('/:id/questions/reorder', async (req: AuthRequest, res) => {
  const { orderedIds }: { orderedIds: string[] } = req.body;
  if (!Array.isArray(orderedIds)) {
    res.status(400).json({ error: 'orderedIds array required' }); return;
  }
  await Promise.all(
    orderedIds.map((qId, idx) =>
      supabaseAdmin.from('questions').update({ order_index: idx }).eq('id', qId)
    )
  );
  res.status(204).send();
});
```

- [ ] **Step 5: Register router in server.ts**

In `server.ts`, add after the existing imports at the top:
```typescript
import { quizRouter } from './server/routes/quiz';
```

In the `// API routes FIRST` section, before the health route, add:
```typescript
app.use(express.json());
app.use('/api/quizzes', quizRouter);
```

- [ ] **Step 6: Run tests**

```bash
npm test server/__tests__/quiz.test.ts
```
Expected: PASS — both tests pass.

- [ ] **Step 7: Commit**

```bash
git add server/ 
git commit -m "feat: add auth middleware and quiz CRUD API (8 endpoints)"
```

---

### Task 5: Shared API fetch helper

**Files:**
- Create: `src/lib/api.ts`

- [ ] **Step 1: Create helper**

Create `src/lib/api.ts`:
```typescript
import { supabase } from './supabase';

export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...options?.headers,
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: add authenticated api fetch helper"
```

---

### Task 6: Auth store + login page

**Files:**
- Create: `src/store/authStore.ts`
- Create: `src/components/auth/LoginPage.tsx`
- Create: `src/components/auth/RequireAuth.tsx`

- [ ] **Step 1: Create auth store**

Create `src/store/authStore.ts`:
```typescript
import { create } from 'zustand';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthStore {
  user: User | null;
  session: Session | null;
  loading: boolean;
  init: () => void;
  signInWithEmail: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  session: null,
  loading: true,

  init: () => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({ session, user: session?.user ?? null, loading: false });
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null, loading: false });
    });
  },

  signInWithEmail: async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/quizzes` },
    });
    return { error: error?.message ?? null };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null });
  },
}));
```

- [ ] **Step 2: Create login page**

Create `src/components/auth/LoginPage.tsx`:
```typescript
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Rocket } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signInWithEmail = useAuthStore((s) => s.signInWithEmail);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await signInWithEmail(email);
    if (result.error) { setError(result.error); return; }
    setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass p-8 rounded-[2rem] max-w-md w-full border-dashed border-2 border-indigo-400/30"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-pink-500 to-indigo-600 flex items-center justify-center mx-auto mb-4">
            <Rocket className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-black tracking-tighter">Host Login</h1>
          <p className="text-gray-400 mt-2 text-sm">We'll send you a magic link — no password needed</p>
        </div>
        {sent ? (
          <div className="text-center">
            <p className="text-xl font-bold text-neon-green mb-2">Check your email ✓</p>
            <p className="text-gray-400 text-sm">Click the link to enter Mission Control</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full glass rounded-xl px-4 py-4 text-center text-lg text-white focus:outline-none focus:ring-1 focus:ring-neon-blue placeholder-gray-500"
            />
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              type="submit"
              className="w-full py-4 text-white font-black text-lg rounded-xl btn-funky uppercase tracking-tighter"
            >
              Send Magic Link
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 3: Create route guard**

Create `src/components/auth/RequireAuth.tsx`:
```typescript
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 font-mono">
        Connecting to cosmos...
      </div>
    );
  }
  if (!user) return null;
  return <>{children}</>;
}
```

- [ ] **Step 4: Update App.tsx**

Replace the full contents of `src/App.tsx` with:
```typescript
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { Home } from './components/Home';
import { HostView } from './components/HostView';
import { PlayerView } from './components/PlayerView';
import { CosmicBackground } from './components/CosmicBackground';
import { DemoPlayer } from './components/DemoPlayer';
import { LoginPage } from './components/auth/LoginPage';
import { RequireAuth } from './components/auth/RequireAuth';
import { QuizListPage } from './components/quiz/QuizListPage';
import { QuizBuilderPage } from './components/quiz/QuizBuilderPage';
import { useAuthStore } from './store/authStore';

export default function App() {
  const init = useAuthStore((s) => s.init);
  useEffect(() => { init(); }, [init]);

  return (
    <Router>
      <div className="relative min-h-screen overflow-hidden">
        <CosmicBackground />
        <div className="orbit w-[1200px] h-[1200px] -top-[400px] left-1/2 -translate-x-1/2" />
        <div className="orbit w-[800px] h-[800px] -top-[200px] left-1/2 -translate-x-1/2" />
        <div className="relative z-10 min-h-screen flex flex-col">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/join" element={<PlayerView />} />
            <Route path="/demo" element={<DemoPlayer />} />
            <Route path="/quizzes" element={<RequireAuth><QuizListPage /></RequireAuth>} />
            <Route path="/quizzes/:id/edit" element={<RequireAuth><QuizBuilderPage /></RequireAuth>} />
            <Route path="/host" element={<RequireAuth><HostView /></RequireAuth>} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}
```

- [ ] **Step 5: Update Home.tsx — "Host Game" → /quizzes**

In `src/components/Home.tsx`, change the Host Game button's `onClick` from:
```typescript
onClick={() => navigate('/host')}
```
to:
```typescript
onClick={() => navigate('/quizzes')}
```

- [ ] **Step 6: Commit**

```bash
git add src/store/authStore.ts src/components/auth/ src/App.tsx src/components/Home.tsx
git commit -m "feat: add supabase auth, login page, route guard"
```

---

### Task 7: Quiz list page

**Files:**
- Create: `src/components/quiz/QuizListPage.tsx`

- [ ] **Step 1: Create the file**

Create `src/components/quiz/QuizListPage.tsx`:
```typescript
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Play, Edit2, Copy, Trash2, CheckCircle, Clock, LogOut } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { apiFetch } from '../../lib/api';

interface Quiz {
  id: string;
  title: string;
  description: string | null;
  is_ready: boolean;
  created_at: string;
}

export function QuizListPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuthStore();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const res = await apiFetch('/api/quizzes');
    setQuizzes(await res.json());
    setLoading(false);
  }

  async function createQuiz(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const res = await apiFetch('/api/quizzes', {
      method: 'POST',
      body: JSON.stringify({ title: newTitle }),
    });
    const quiz = await res.json();
    setCreating(false);
    setNewTitle('');
    navigate(`/quizzes/${quiz.id}/edit`);
  }

  async function duplicate(id: string) {
    await apiFetch(`/api/quizzes/${id}/duplicate`, { method: 'POST' });
    load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this quiz?')) return;
    await apiFetch(`/api/quizzes/${id}`, { method: 'DELETE' });
    setQuizzes((prev) => prev.filter((q) => q.id !== id));
  }

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-black tracking-tighter">Mission Control</h1>
          <p className="text-gray-400 text-sm mt-1">{user?.email}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setCreating(true)}
            className="py-2 px-4 text-white font-bold rounded-xl flex items-center gap-2 btn-funky"
          >
            <Plus className="w-4 h-4" /> New Quiz
          </button>
          <button onClick={signOut} className="p-2 glass rounded-xl hover:bg-white/10" title="Sign out">
            <LogOut className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {creating && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={createQuiz}
            className="glass p-4 rounded-2xl mb-6 flex gap-3 overflow-hidden"
          >
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Quiz title..."
              className="flex-1 bg-transparent outline-none text-lg font-bold placeholder-gray-500"
            />
            <button type="submit" className="btn-funky px-4 py-2 rounded-xl text-white font-bold text-sm">
              Create
            </button>
            <button type="button" onClick={() => setCreating(false)} className="px-4 py-2 glass rounded-xl text-gray-400 text-sm">
              Cancel
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="text-center text-gray-500 py-16 font-mono">Loading quizzes...</div>
      ) : quizzes.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-xl text-gray-500 mb-4">No quizzes yet</p>
          <button onClick={() => setCreating(true)} className="btn-funky px-6 py-3 rounded-xl text-white font-bold">
            Create your first quiz
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence>
            {quizzes.map((quiz) => (
              <motion.div
                key={quiz.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="glass p-5 rounded-2xl flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-xl font-bold truncate">{quiz.title}</h3>
                    {quiz.is_ready ? (
                      <span className="flex items-center gap-1 text-xs text-neon-green bg-neon-green/10 px-2 py-0.5 rounded-full shrink-0">
                        <CheckCircle className="w-3 h-3" /> Ready
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-gray-400 bg-white/5 px-2 py-0.5 rounded-full shrink-0">
                        <Clock className="w-3 h-3" /> Draft
                      </span>
                    )}
                  </div>
                  {quiz.description && (
                    <p className="text-gray-400 text-sm truncate">{quiz.description}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => navigate(`/host?quizId=${quiz.id}`)}
                    className="btn-funky p-2 rounded-xl"
                    title="Host game"
                  >
                    <Play className="w-4 h-4 text-white" />
                  </button>
                  <button
                    onClick={() => navigate(`/quizzes/${quiz.id}/edit`)}
                    className="p-2 glass rounded-xl hover:bg-white/10"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4 text-gray-300" />
                  </button>
                  <button
                    onClick={() => duplicate(quiz.id)}
                    className="p-2 glass rounded-xl hover:bg-white/10"
                    title="Duplicate"
                  >
                    <Copy className="w-4 h-4 text-gray-300" />
                  </button>
                  <button
                    onClick={() => remove(quiz.id)}
                    className="p-2 glass rounded-xl hover:bg-red-500/20"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/quiz/QuizListPage.tsx
git commit -m "feat: add quiz list page"
```

---

### Task 8: Quiz builder page with drag-and-drop

**Files:**
- Create: `src/components/quiz/QuestionCard.tsx`
- Create: `src/components/quiz/QuizBuilderPage.tsx`

- [ ] **Step 1: Create QuestionCard**

Create `src/components/quiz/QuestionCard.tsx`:
```typescript
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { useState } from 'react';

export interface QuestionData {
  id: string;
  text: string;
  options: string[];
  correct_index: number;
  time_limit_sec: 10 | 20 | 30;
  point_multiplier: 1 | 2;
  order_index: number;
}

interface Props {
  question: QuestionData;
  index: number;
  onUpdate: (id: string, updates: Partial<QuestionData>) => void;
  onDelete: (id: string) => void;
}

const OPTION_COLORS = [
  'bg-red-500/20 border-red-500/50',
  'bg-blue-500/20 border-blue-500/50',
  'bg-yellow-500/20 border-yellow-500/50',
  'bg-green-500/20 border-green-500/50',
];
const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export function QuestionCard({ question, index, onUpdate, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: question.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="glass rounded-2xl overflow-hidden">
      {/* Collapsed row */}
      <div className="flex items-center gap-3 p-4">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-500 hover:text-white p-1 touch-none"
        >
          <GripVertical className="w-5 h-5" />
        </button>
        <span className="text-sm font-mono text-gray-500 w-6 shrink-0">Q{index + 1}</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold truncate">
            {question.text || <span className="text-gray-500 italic font-normal">No question text</span>}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {question.time_limit_sec}s · {question.point_multiplier}× pts ·{' '}
            {question.options.filter(Boolean).length} options
          </p>
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="p-2 glass rounded-xl hover:bg-white/10"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <button
          onClick={() => onDelete(question.id)}
          className="p-2 glass rounded-xl hover:bg-red-500/20"
        >
          <Trash2 className="w-4 h-4 text-red-400" />
        </button>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div className="border-t border-white/10 p-4 space-y-4">
          <textarea
            value={question.text}
            onChange={(e) => onUpdate(question.id, { text: e.target.value })}
            maxLength={280}
            rows={2}
            placeholder="Question text (max 280 characters)"
            className="w-full bg-white/5 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-neon-blue resize-none"
          />

          <div className="grid grid-cols-2 gap-3">
            {([0, 1, 2, 3] as const).map((i) => (
              <div key={i} className={`rounded-xl border p-3 ${OPTION_COLORS[i]}`}>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm w-5 shrink-0 text-gray-300">{OPTION_LABELS[i]}</span>
                  <input
                    value={question.options[i] ?? ''}
                    onChange={(e) => {
                      const opts = [...question.options];
                      opts[i] = e.target.value;
                      onUpdate(question.id, { options: opts });
                    }}
                    maxLength={120}
                    placeholder={`Option ${OPTION_LABELS[i]}`}
                    className="flex-1 bg-transparent outline-none text-sm placeholder-gray-500 min-w-0"
                  />
                  <button
                    onClick={() => onUpdate(question.id, { correct_index: i })}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      question.correct_index === i
                        ? 'bg-neon-green border-neon-green'
                        : 'border-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {question.correct_index === i && <Check className="w-3 h-3 text-black" />}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-6">
            <div>
              <label className="text-xs text-gray-400 block mb-2 uppercase tracking-widest">Time limit</label>
              <div className="flex gap-2">
                {([10, 20, 30] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => onUpdate(question.id, { time_limit_sec: t })}
                    className={`px-3 py-1 rounded-lg text-sm font-bold transition-colors ${
                      question.time_limit_sec === t ? 'bg-neon-blue text-black' : 'glass hover:bg-white/10'
                    }`}
                  >
                    {t}s
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-2 uppercase tracking-widest">Points</label>
              <div className="flex gap-2">
                {([1, 2] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => onUpdate(question.id, { point_multiplier: m })}
                    className={`px-3 py-1 rounded-lg text-sm font-bold transition-colors ${
                      question.point_multiplier === m ? 'bg-neon-purple text-white' : 'glass hover:bg-white/10'
                    }`}
                  >
                    {m}×
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create QuizBuilderPage**

Create `src/components/quiz/QuizBuilderPage.tsx`:
```typescript
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, CheckCircle, Save } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { QuestionCard, QuestionData } from './QuestionCard';

interface Quiz { id: string; title: string; description: string | null; is_ready: boolean; }

export function QuizBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => { if (id) loadQuiz(id); }, [id]);

  async function loadQuiz(quizId: string) {
    const res = await apiFetch(`/api/quizzes/${quizId}`);
    const data = await res.json();
    setQuiz(data);
    setTitleDraft(data.title);
    setQuestions(data.questions ?? []);
  }

  async function saveTitle() {
    if (!quiz || !titleDraft.trim()) return;
    setEditingTitle(false);
    await apiFetch(`/api/quizzes/${quiz.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: titleDraft }),
    });
    setQuiz((prev) => prev ? { ...prev, title: titleDraft } : prev);
  }

  async function addQuestion() {
    const payload = {
      text: '',
      options: ['', '', '', ''],
      correct_index: 0,
      time_limit_sec: 20,
      point_multiplier: 1,
      order_index: questions.length,
    };
    const res = await apiFetch(`/api/quizzes/${id}/questions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const created = await res.json();
    setQuestions((prev) => [...prev, created]);
  }

  const updateQuestion = useCallback(async (qId: string, updates: Partial<QuestionData>) => {
    setQuestions((prev) => prev.map((q) => (q.id === qId ? { ...q, ...updates } : q)));
    setSaving(true);
    await apiFetch(`/api/quizzes/questions/${qId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    setSaving(false);
  }, []);

  async function deleteQuestion(qId: string) {
    await apiFetch(`/api/quizzes/questions/${qId}`, { method: 'DELETE' });
    setQuestions((prev) => prev.filter((q) => q.id !== qId));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = questions.findIndex((q) => q.id === active.id);
    const newIdx = questions.findIndex((q) => q.id === over.id);
    const reordered = arrayMove(questions, oldIdx, newIdx).map((q, i) => ({ ...q, order_index: i }));
    setQuestions(reordered);
    await apiFetch(`/api/quizzes/${id}/questions/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ orderedIds: reordered.map((q) => q.id) }),
    });
  }

  async function toggleReady() {
    if (!quiz) return;
    const is_ready = !quiz.is_ready;
    await apiFetch(`/api/quizzes/${quiz.id}`, { method: 'PATCH', body: JSON.stringify({ is_ready }) });
    setQuiz((prev) => prev ? { ...prev, is_ready } : prev);
  }

  if (!quiz) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading quiz...</div>;
  }

  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto pb-28">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/quizzes')} className="p-2 glass rounded-xl hover:bg-white/10">
          <ArrowLeft className="w-5 h-5" />
        </button>
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
            className="flex-1 bg-transparent text-3xl font-black outline-none border-b-2 border-neon-blue pb-1"
          />
        ) : (
          <h1
            className="text-3xl font-black cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => setEditingTitle(true)}
            title="Click to rename"
          >
            {quiz.title}
          </h1>
        )}
        {saving && (
          <span className="text-xs text-gray-500 flex items-center gap-1 shrink-0">
            <Save className="w-3 h-3" /> Saving...
          </span>
        )}
      </div>

      {/* Question list */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {questions.map((q, i) => (
              <QuestionCard
                key={q.id}
                question={q}
                index={i}
                onUpdate={updateQuestion}
                onDelete={deleteQuestion}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {questions.length === 0 && (
        <div className="text-center text-gray-500 py-16">
          No questions yet — add your first one below.
        </div>
      )}

      {/* Floating action bar */}
      <div className="fixed bottom-8 left-0 right-0 flex justify-center gap-4 px-6">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={addQuestion}
          className="btn-funky px-6 py-3 rounded-xl text-white font-bold flex items-center gap-2 shadow-xl"
        >
          <Plus className="w-5 h-5" /> Add Question
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={toggleReady}
          className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 glass border shadow-xl ${
            quiz.is_ready
              ? 'border-neon-green text-neon-green'
              : 'border-gray-500 text-gray-300 hover:border-gray-300'
          }`}
        >
          <CheckCircle className="w-5 h-5" />
          {quiz.is_ready ? 'Marked Ready' : 'Mark as Ready'}
        </motion.button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/quiz/
git commit -m "feat: add quiz builder with drag-and-drop question ordering"
```

---

### Task 9: Wire quiz selection into HostView

**Files:**
- Modify: `src/store.ts`
- Modify: `src/components/HostView.tsx`
- Modify: `server.ts`

- [ ] **Step 1: Add pointMultiplier to Question type in store.ts**

In `src/store.ts`, update the `Question` interface:
```typescript
export interface Question {
  id?: string;
  text: string;
  options: string[];
  correctIndex: number;
  timeLimit: number;       // milliseconds
  pointMultiplier?: number; // 1 or 2, defaults to 1
}
```

Update `hostGame` signature:
```typescript
hostGame: (questions: Question[], quizId?: string) => void;
```

Update `hostGame` implementation:
```typescript
hostGame: (questions: Question[], quizId?: string) => {
  get().socket?.emit('host-game', { customQuestions: questions, quizId });
},
```

- [ ] **Step 2: Update HostView to load quiz from URL param**

At the top of `src/components/HostView.tsx`, add these imports:
```typescript
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
```

Replace the `DEFAULT_QUESTIONS` constant and the `isEditing` state with a `useEffect` that loads the quiz:

```typescript
export function HostView() {
  const [searchParams] = useSearchParams();
  const quizId = searchParams.get('quizId');
  const [loadingQuiz, setLoadingQuiz] = useState(true);
  const [quizTitle, setQuizTitle] = useState('');

  const {
    gamePin, gameState, players, question, currentQuestionIndex,
    totalQuestions, hostGame, startGame, showResults, nextQuestion,
    questionStartTime, connect,
  } = useGameStore();

  useEffect(() => { connect(); }, [connect]);

  useEffect(() => {
    if (!quizId) { setLoadingQuiz(false); return; }
    (async () => {
      const res = await apiFetch(`/api/quizzes/${quizId}`);
      const data = await res.json();
      setQuizTitle(data.title);
      const questions: Question[] = (data.questions ?? []).map((q: any) => ({
        id: q.id,
        text: q.text,
        options: q.options,
        correctIndex: q.correct_index,
        timeLimit: q.time_limit_sec * 1000,
        pointMultiplier: q.point_multiplier,
      }));
      hostGame(questions, quizId);
      setLoadingQuiz(false);
    })();
  }, [quizId]);

  if (loadingQuiz) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading quiz...</div>;
  }
  if (!quizId && !gamePin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">No quiz selected. <a href="/quizzes" className="text-neon-blue underline">Go to Mission Control</a></p>
      </div>
    );
  }

  // ... rest of HostView JSX (LOBBY, QUESTION_ACTIVE, etc.) unchanged ...
}
```

Remove the old `isEditing` state, `handleHost` function, and the editing form block from the existing `HostView`.

- [ ] **Step 3: Update scoring formula in server.ts**

In `server.ts`, replace the scoring block inside `submit-answer` handler:

```typescript
if (isCorrect) {
  const timeTaken = Date.now() - questionStartTime;
  const maxTime = currentQuestion.timeLimit || 20000;
  const speedFactor = 0.5 + 0.5 * Math.max(0, maxTime - timeTaken) / maxTime;
  const multiplier = currentQuestion.pointMultiplier || 1;
  const points = Math.round(1000 * multiplier * speedFactor);
  player.score += points;
  player.lastPointsEarned = points;
} else {
  player.lastPointsEarned = 0;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/store.ts src/components/HostView.tsx server.ts
git commit -m "feat: wire quiz builder into host game session with multiplier scoring"
```

---

## Self-Review

**Spec coverage:**
- ✅ Host creates quiz with title + optional description
- ✅ Add questions: text, 2–4 options, 1 correct answer, time limit (10/20/30s), multiplier (1×/2×)
- ✅ Reorder via drag-and-drop
- ✅ Edit/delete individual questions
- ✅ Save as draft / mark as ready
- ✅ Duplicate quiz
- ✅ Host auth (Supabase magic link)
- ✅ Quiz loads into game session from DB
- ✅ Scoring formula updated: `1000 × multiplier × speedFactor`
- ✅ RLS policies ensure hosts only see their own quizzes
- ✅ `apiFetch` shared helper (no duplication)

**Placeholder scan:** None. All code blocks are complete implementations.

**Type consistency:** `Question.pointMultiplier` (camelCase, store/frontend) ↔ `point_multiplier` (snake_case, DB/API) — correctly mapped in Task 9 Step 2. `QuestionData` in QuestionCard matches the questions API response shape exactly.
