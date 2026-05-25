# Public Quiz Hosting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow unauthenticated users to host a game from a quiz created by the owner, using a shareable link — without exposing draft quizzes or ownership data.

**Architecture:** Add a new unauthenticated `GET /api/quizzes/:id/public` endpoint that returns quiz+questions only for `is_ready = true` quizzes. `HostView` switches to this public endpoint so no login is needed to host. On the owner's quiz list, rename "Mark as Ready" → "Publish/Unpublish" and add a copy-link button beside each published quiz.

**Tech Stack:** Express + Supabase (server), React + Tailwind (client), Vitest + Supertest (tests)

---

## File Map

| File | Change |
|------|--------|
| `server/routes/quiz.ts` | Add `GET /:id/public` handler before `requireAuth` |
| `server/__tests__/quiz.test.ts` | Add tests for the public endpoint |
| `src/components/HostView.tsx` | Swap `apiFetch` → `fetch` pointing at `/public` URL |
| `src/components/quiz/QuizBuilderPage.tsx` | Rename toggle button label to "Publish / Unpublish" |
| `src/components/quiz/QuizListPage.tsx` | Add "Copy host link" icon button for published quizzes |

---

### Task 1: Add the public quiz endpoint (server)

**Files:**
- Modify: `server/routes/quiz.ts` (add before line 6 `quizRouter.use(requireAuth)`)

The new route must be registered **before** `quizRouter.use(requireAuth)` — Express matches routes in declaration order, so this handler fires without auth for `/:id/public` while all other routes remain protected.

- [ ] **Step 1: Open `server/routes/quiz.ts` and add the public route before `quizRouter.use(requireAuth)`**

```ts
// server/routes/quiz.ts — insert between line 5 and line 6
quizRouter.get('/:id/public', async (req, res) => {
  const { data: quiz, error } = await supabaseAdmin
    .from('quizzes')
    .select('id, title, description')
    .eq('id', req.params.id)
    .eq('is_ready', true)
    .single();
  if (error || !quiz) { res.status(404).json({ error: 'Not found' }); return; }

  const { data: questions } = await supabaseAdmin
    .from('questions')
    .select('id, text, options, correct_index, time_limit_sec, point_multiplier, image_url, topic, order_index')
    .eq('quiz_id', req.params.id)
    .order('order_index');

  res.json({ ...quiz, questions: questions || [] });
});
```

The result shape is identical to the existing `GET /:id` route except `host_id` is omitted — `HostView` can consume it unchanged.

- [ ] **Step 2: Verify the file compiles**

```bash
npm run lint
```
Expected: no TypeScript errors.

---

### Task 2: Test the public endpoint

**Files:**
- Modify: `server/__tests__/quiz.test.ts`

- [ ] **Step 1: Add three tests for the public endpoint**

Append inside the existing `describe('Quiz API', ...)` block:

```ts
  it('GET /api/quizzes/:id/public returns 200 without token when quiz is ready', async () => {
    const { supabaseAdmin } = await import('../lib/supabase.js');
    let callCount = 0;
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // quizzes query
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 'quiz-1', title: 'Space Quiz', description: null },
            error: null,
          }),
        };
      }
      // questions query
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });
    const { quizRouter } = await import('../routes/quiz.js');
    const app = express();
    app.use(express.json());
    app.use('/api/quizzes', quizRouter);
    const res = await request(app).get('/api/quizzes/quiz-1/public');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('title', 'Space Quiz');
    expect(res.body).toHaveProperty('questions');
    expect(res.body).not.toHaveProperty('host_id');
  });

  it('GET /api/quizzes/:id/public returns 404 when quiz is draft (is_ready = false)', async () => {
    const { supabaseAdmin } = await import('../lib/supabase.js');
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    });
    const { quizRouter } = await import('../routes/quiz.js');
    const app = express();
    app.use(express.json());
    app.use('/api/quizzes', quizRouter);
    const res = await request(app).get('/api/quizzes/draft-quiz/public');
    expect(res.status).toBe(404);
  });

  it('GET /api/quizzes/:id/public does not expose host_id', async () => {
    const { supabaseAdmin } = await import('../lib/supabase.js');
    let callCount = 0;
    (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 'quiz-1', title: 'Space Quiz', description: null },
            error: null,
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });
    const { quizRouter } = await import('../routes/quiz.js');
    const app = express();
    app.use(express.json());
    app.use('/api/quizzes', quizRouter);
    const res = await request(app).get('/api/quizzes/quiz-1/public');
    expect(res.body).not.toHaveProperty('host_id');
  });
```

- [ ] **Step 2: Run tests and confirm all pass**

```bash
npm test
```
Expected: all tests pass, including the three new ones.

- [ ] **Step 3: Commit**

```bash
git add server/routes/quiz.ts server/__tests__/quiz.test.ts
git commit -m "feat: add unauthenticated public quiz read endpoint"
```

---

### Task 3: Wire HostView to the public endpoint (client)

**Files:**
- Modify: `src/components/HostView.tsx` (line 66)

`apiFetch` attaches a Supabase Bearer token when a session exists and requires one on the server side. Unauthenticated users have no session, so the token is absent and the existing protected route returns 401. The fix is to call the new `/public` URL with a plain `fetch` — no auth header needed, works for everyone.

- [ ] **Step 1: Replace the `apiFetch` call with `fetch` on the public endpoint**

In `src/components/HostView.tsx`, change the `useEffect` starting at line 64:

```ts
  useEffect(() => {
    if (!quizId) return;
    fetch(`/api/quizzes/${quizId}/public`)
      .then((r) => r.json())
      .then((data) => {
        const qs: Question[] = (data.questions ?? []).map((q: any) => ({
          id: q.id,
          text: q.text,
          options: q.options,
          correctIndex: q.correct_index,
          timeLimit: q.time_limit_sec * 1000,
          pointMultiplier: q.point_multiplier,
          imageUrl: q.image_url ?? undefined,
          topic: q.topic ?? null,
        }));
        setPendingQuestions(qs);
        setLoadingQuiz(false);
      });
  }, [quizId]);
```

Also remove the unused `apiFetch` import from line 7 if nothing else in the file uses it.

- [ ] **Step 2: Verify the import is no longer needed**

```bash
grep -n "apiFetch" src/components/HostView.tsx
```
Expected: no output (import removed, no remaining uses).

- [ ] **Step 3: Run lint**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/HostView.tsx
git commit -m "feat: host flow uses public endpoint — no auth required to host a game"
```

---

### Task 4: Rename the toggle in QuizBuilderPage

**Files:**
- Modify: `src/components/quiz/QuizBuilderPage.tsx` (lines 244–255)

"Mark as Ready" doesn't communicate that flipping it makes the quiz publicly hostable. Rename to "Publish" / "Unpublish" so the intent is clear.

- [ ] **Step 1: Update the toggle button label**

In `src/components/quiz/QuizBuilderPage.tsx`, replace the button at lines 244–255:

```tsx
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
          {quiz.is_ready ? 'Published' : 'Publish'}
        </motion.button>
```

- [ ] **Step 2: Run lint**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/quiz/QuizBuilderPage.tsx
git commit -m "ux: rename Mark as Ready to Publish/Published in quiz builder"
```

---

### Task 5: Add "Copy host link" button to QuizListPage

**Files:**
- Modify: `src/components/quiz/QuizListPage.tsx`

The quiz list already shows a "Ready" / "Draft" badge. For published quizzes, add a link icon button that copies the full host URL (`/host?quizId=<id>`) to the clipboard. Show a brief "Copied!" tooltip to confirm.

- [ ] **Step 1: Add `Link` to the lucide-react import and add copied-state**

At the top of `QuizListPage.tsx`, update the lucide import (line 4) to include `Link`:

```ts
import { Plus, Play, Edit2, Copy, Trash2, CheckCircle, Clock, LogOut, History, Link } from 'lucide-react';
```

Add a copied-state tracker inside `QuizListPage` (after line 22 `const [newTitle, setNewTitle] = useState('');`):

```ts
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyHostLink(id: string) {
    const url = `${window.location.origin}/host?quizId=${id}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }
```

- [ ] **Step 2: Add the copy-link button inside the per-quiz action row**

In the quiz card's button row (after the Play button, before Edit2), add this button that only appears when `quiz.is_ready`:

```tsx
                  {quiz.is_ready && (
                    <button
                      onClick={() => copyHostLink(quiz.id)}
                      className="p-2 glass rounded-xl hover:bg-white/10 relative"
                      title="Copy host link"
                    >
                      <Link className="w-4 h-4 text-neon-green" />
                      {copiedId === quiz.id && (
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs bg-black/80 text-neon-green px-2 py-1 rounded whitespace-nowrap">
                          Copied!
                        </span>
                      )}
                    </button>
                  )}
```

Place it between the Play button (`onClick={() => navigate(...)}`) and the Edit2 button so the action order is: Host → Share link → Edit → Duplicate → Delete.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/quiz/QuizListPage.tsx
git commit -m "ux: add copy host link button for published quizzes in quiz list"
```

---

### Task 6: Smoke test end-to-end

No code changes — manual verification only.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Log in as the quiz owner and publish a quiz**

1. Go to `/quizzes`, open a quiz in the builder
2. Click "Publish" — badge should turn green and button label should read "Published"
3. Return to `/quizzes` — the quiz row should show the green link icon

- [ ] **Step 3: Copy the host link and open it in a private/incognito window**

1. Click the link icon on the quiz row — confirm "Copied!" tooltip appears
2. Open a new incognito browser window (no Supabase session)
3. Paste the URL (e.g. `http://localhost:3000/host?quizId=<uuid>`)
4. Confirm the lobby loads with the game PIN and QR code — no login prompt

- [ ] **Step 4: Verify draft quiz is blocked**

1. In the builder, click "Published" to unpublish the same quiz (back to draft)
2. Reload the host URL in the incognito window
3. Confirm the page shows "Loading quiz..." and then falls through to the "No quiz selected" fallback (the public endpoint returns 404 for drafts)

- [ ] **Step 5: Run tests one final time**

```bash
npm test
```
Expected: all tests pass.
