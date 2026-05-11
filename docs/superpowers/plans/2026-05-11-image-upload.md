# Question Image Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional per-question image upload to StellarTrivia — images stored in Supabase Storage, displayed as a full-width banner on the host screen during live gameplay.

**Architecture:** A new Express upload router handles `POST /api/upload/question-image` (multer multipart → Supabase Storage → return CDN URL) and `DELETE /api/upload/question-image` (strip URL prefix → remove from Storage). The CDN URL is saved to a new nullable `image_url` column on `questions` via the existing PATCH route. `QuestionCard` gains a drag-and-drop image zone at the top of its expanded panel. `HostView` renders a full-width `<img>` banner above the question text when `imageUrl` is set.

**Tech Stack:** `multer` (multipart parsing), `@supabase/supabase-js` storage API, React drag-and-drop, Tailwind CSS v4, `lucide-react`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `server/routes/upload.ts` | **Create** | POST upload + DELETE remove endpoints |
| `server.ts` | **Modify** | Mount upload router |
| `server/routes/quiz.ts` | **Modify** | Add `image_url` to PATCH allowed fields |
| `src/lib/api.ts` | **Modify** | Add `apiFetchFormData` helper (multipart, no Content-Type header) |
| `src/store.ts` | **Modify** | Add `imageUrl?: string` to `Question` interface |
| `src/components/quiz/QuestionCard.tsx` | **Modify** | Add `image_url` to `QuestionData`, full upload zone UI |
| `src/components/HostView.tsx` | **Modify** | Map `image_url → imageUrl`, render image banner |
| `package.json` | **Modify** | Add `multer` + `@types/multer` |

---

## Task 1: Install multer

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/anduin/projects/stellar-kahoot
npm install multer
npm install -D @types/multer
```

Expected: multer and @types/multer appear in `package.json`.

- [ ] **Step 2: Verify type check passes**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add multer for multipart file uploads"
```

---

## Task 2: DB migration — add image_url column (manual step)

**This is a manual Supabase dashboard step — no code to commit.**

- [ ] **Step 1: Open Supabase SQL editor**

Go to your Supabase project → SQL Editor → New query.

- [ ] **Step 2: Run the migration**

```sql
ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_url TEXT;
```

- [ ] **Step 3: Verify**

Run this query to confirm the column exists:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'questions' AND column_name = 'image_url';
```

Expected: one row with `column_name = image_url`, `data_type = text`, `is_nullable = YES`.

---

## Task 3: Create Supabase Storage bucket (manual step)

**This is a manual Supabase dashboard step — no code to commit.**

- [ ] **Step 1: Open Storage in Supabase dashboard**

Go to Storage → New bucket.

- [ ] **Step 2: Create the bucket**

- Name: `question-images`
- Public bucket: **on** (so CDN URLs are publicly readable without auth)
- File size limit: `10485760` (10 MB in bytes)
- Allowed MIME types: `image/jpeg, image/png, image/webp, image/gif`

- [ ] **Step 3: Verify**

Upload any small image manually via the dashboard. Copy its public URL. It should follow this format:

```
https://<project-ref>.supabase.co/storage/v1/object/public/question-images/<path>
```

Note your `SUPABASE_URL` from `.env.local` — it is `https://<project-ref>.supabase.co`. You'll need this for the delete endpoint path-stripping logic.

---

## Task 4: Add image_url to quiz PATCH allowed fields

**Files:**
- Modify: `server/routes/quiz.ts:133`

- [ ] **Step 1: Open `server/routes/quiz.ts` and find the PATCH handler**

The handler at line ~132 has:
```ts
const allowed = ['text', 'options', 'correct_index', 'time_limit_sec', 'point_multiplier'];
```

- [ ] **Step 2: Add image_url to the allowed list**

Replace that line with:
```ts
const allowed = ['text', 'options', 'correct_index', 'time_limit_sec', 'point_multiplier', 'image_url'];
```

- [ ] **Step 3: Verify type check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server/routes/quiz.ts
git commit -m "feat: allow image_url field in question PATCH route"
```

---

## Task 5: Create upload router

**Files:**
- Create: `server/routes/upload.ts`

- [ ] **Step 1: Create `server/routes/upload.ts` with this content**

```ts
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

export const uploadRouter = Router();

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 10 * 1024 * 1024;

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

function runMulter(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    upload.single('file')(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

uploadRouter.post('/question-image', requireAuth, async (req: AuthRequest, res) => {
  try {
    await runMulter(req, res);
  } catch (err: any) {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? 'File too large — max 10 MB'
      : err.message || 'Upload error';
    res.status(400).json({ error: msg });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'No file provided' });
    return;
  }

  const questionId = req.body.questionId || 'misc';
  const timestamp = Date.now();
  const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `questions/${questionId}/${timestamp}-${safeName}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from('question-images')
    .upload(path, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false,
    });

  if (uploadError) {
    res.status(500).json({ error: 'Storage upload failed' });
    return;
  }

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('question-images')
    .getPublicUrl(path);

  res.json({ url: publicUrl });
});

uploadRouter.delete('/question-image', requireAuth, async (req: AuthRequest, res) => {
  const { url } = req.body as { url?: string };
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'url required' });
    return;
  }

  const base = `${process.env.SUPABASE_URL}/storage/v1/object/public/question-images/`;
  if (!url.startsWith(base)) {
    res.status(400).json({ error: 'Invalid storage URL' });
    return;
  }
  const storagePath = url.slice(base.length);

  const { error } = await supabaseAdmin.storage
    .from('question-images')
    .remove([storagePath]);

  if (error) {
    res.status(500).json({ error: 'Storage delete failed' });
    return;
  }

  res.status(204).send();
});
```

- [ ] **Step 2: Verify type check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/routes/upload.ts
git commit -m "feat: add question image upload/delete API endpoints"
```

---

## Task 6: Mount upload router in server.ts

**Files:**
- Modify: `server.ts`

- [ ] **Step 1: Add the import**

In `server.ts`, find the existing router imports at the top:
```ts
import { quizRouter } from "./server/routes/quiz.js";
import { gamesRouter } from "./server/routes/games.js";
```

Add after them:
```ts
import { uploadRouter } from "./server/routes/upload.js";
```

- [ ] **Step 2: Mount the router**

Find where the other routers are mounted (~line 334):
```ts
app.use('/api/quizzes', quizRouter);
app.use('/api/games', gamesRouter);
```

Add after them:
```ts
app.use('/api/upload', uploadRouter);
```

- [ ] **Step 3: Verify type check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Smoke test the endpoint**

```bash
npm run dev
```

In a separate terminal:
```bash
curl -X POST http://localhost:3000/api/upload/question-image \
  -H "Authorization: Bearer invalid-token"
```

Expected: `{"error":"Invalid token"}` (401) — confirms the route is mounted and auth is wired up.

- [ ] **Step 5: Commit**

```bash
git add server.ts
git commit -m "feat: mount upload router at /api/upload"
```

---

## Task 7: Add apiFetchFormData helper

**Files:**
- Modify: `src/lib/api.ts`

`apiFetch` always sets `Content-Type: application/json`, which breaks multipart uploads. Add a dedicated helper that omits it so the browser sets the correct `multipart/form-data` boundary automatically.

- [ ] **Step 1: Open `src/lib/api.ts`**

Current content:
```ts
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

- [ ] **Step 2: Add the new helper at the bottom of the file**

```ts
export async function apiFetchFormData(path: string, formData: FormData): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch(path, {
    method: 'POST',
    body: formData,
    headers: {
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  });
}
```

- [ ] **Step 3: Verify type check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: add apiFetchFormData helper for multipart uploads"
```

---

## Task 8: Add imageUrl to Question interface

**Files:**
- Modify: `src/store.ts:17-24`

- [ ] **Step 1: Open `src/store.ts` and find the Question interface**

Current:
```ts
export interface Question {
  id?: string;
  text: string;
  options: string[];
  correctIndex: number;
  timeLimit: number;
  pointMultiplier?: number;
}
```

- [ ] **Step 2: Add imageUrl field**

Replace with:
```ts
export interface Question {
  id?: string;
  text: string;
  options: string[];
  correctIndex: number;
  timeLimit: number;
  pointMultiplier?: number;
  imageUrl?: string;
}
```

- [ ] **Step 3: Verify type check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/store.ts
git commit -m "feat: add imageUrl field to Question interface"
```

---

## Task 9: Update QuestionCard with image upload UI

**Files:**
- Modify: `src/components/quiz/QuestionCard.tsx`

This is the largest change. We're adding:
- `image_url?: string | null` to `QuestionData`
- Upload state + file input ref
- Drag-and-drop handlers
- Image zone UI at top of expanded section (three visual states: empty, uploading, preview)
- Image indicator badge in collapsed header

- [ ] **Step 1: Update the imports at the top of `QuestionCard.tsx`**

Current imports:
```ts
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { useState } from 'react';
```

Replace with:
```ts
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, ChevronDown, ChevronUp, Check, ImageIcon, X, Loader2 } from 'lucide-react';
import { useState, useRef } from 'react';
import { apiFetch, apiFetchFormData } from '../../lib/api';
```

- [ ] **Step 2: Add image_url to the QuestionData interface**

Current `QuestionData`:
```ts
export interface QuestionData {
  id: string;
  text: string;
  options: string[];
  correct_index: number;
  time_limit_sec: 10 | 20 | 30;
  point_multiplier: 1 | 2;
  order_index: number;
}
```

Replace with:
```ts
export interface QuestionData {
  id: string;
  text: string;
  options: string[];
  correct_index: number;
  time_limit_sec: 10 | 20 | 30;
  point_multiplier: 1 | 2;
  order_index: number;
  image_url?: string | null;
}
```

- [ ] **Step 3: Add state and handlers inside the QuestionCard component**

Find the line `const [expanded, setExpanded] = useState(false);` inside `QuestionCard`. Add below it:

```ts
const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'error'>('idle');
const [uploadError, setUploadError] = useState<string | null>(null);
const [dragOver, setDragOver] = useState(false);
const fileInputRef = useRef<HTMLInputElement>(null);

async function handleFileSelect(file: File) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowed.includes(file.type)) {
    setUploadError('Unsupported type. Use PNG, JPG, WebP, or GIF.');
    setUploadState('error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    setUploadError('File too large — max 10 MB.');
    setUploadState('error');
    return;
  }
  setUploadState('uploading');
  setUploadError(null);
  const form = new FormData();
  form.append('file', file);
  form.append('questionId', question.id);
  const res = await apiFetchFormData('/api/upload/question-image', form);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    setUploadError(body.error || 'Upload failed.');
    setUploadState('error');
    return;
  }
  const { url } = await res.json();
  onUpdate(question.id, { image_url: url });
  setUploadState('idle');
}

async function handleDeleteImage() {
  const url = question.image_url;
  if (!url) return;
  onUpdate(question.id, { image_url: null });
  await apiFetch('/api/upload/question-image', {
    method: 'DELETE',
    body: JSON.stringify({ url }),
  });
}

function handleDrop(e: React.DragEvent) {
  e.preventDefault();
  setDragOver(false);
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
}
```

- [ ] **Step 4: Add the image indicator to the collapsed header**

Find the metadata `<p>` in the collapsed header:
```tsx
<p className="text-xs text-gray-500 mt-0.5">
  {question.time_limit_sec}s · {question.point_multiplier}× pts · {question.options.filter(Boolean).length} options
</p>
```

Replace with:
```tsx
<p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
  {question.time_limit_sec}s · {question.point_multiplier}× pts · {question.options.filter(Boolean).length} options
  {question.image_url && <><span>·</span><ImageIcon className="w-3 h-3 text-neon-blue" /></>}
</p>
```

- [ ] **Step 5: Add the image zone at the top of the expanded section**

Find the opening of the expanded section:
```tsx
{expanded && (
  <div className="border-t border-white/10 p-4 space-y-4">
    <textarea
```

Insert the image zone + hidden file input between `<div className="border-t border-white/10 p-4 space-y-4">` and the `<textarea>`:

```tsx
{expanded && (
  <div className="border-t border-white/10 p-4 space-y-4">
    {/* Image upload zone */}
    <input
      ref={fileInputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp,image/gif"
      className="hidden"
      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }}
    />

    {question.image_url ? (
      <div className="relative rounded-xl overflow-hidden" style={{ height: 160 }}>
        <img
          src={question.image_url}
          alt="Question image"
          className="w-full h-full object-cover"
        />
        <button
          onClick={handleDeleteImage}
          className="absolute top-2 right-2 p-1 rounded-full bg-black/60 hover:bg-red-500/80 transition-colors"
        >
          <X className="w-4 h-4 text-white" />
        </button>
      </div>
    ) : uploadState === 'uploading' ? (
      <div className="flex items-center justify-center rounded-xl border border-white/10 bg-white/5" style={{ height: 100 }}>
        <Loader2 className="w-6 h-6 text-neon-blue animate-spin" />
      </div>
    ) : (
      <div
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
          dragOver ? 'border-neon-blue bg-neon-blue/10' : 'border-white/20 hover:border-white/40 bg-white/5'
        }`}
        style={{ height: 100 }}
      >
        <ImageIcon className="w-6 h-6 text-gray-500" />
        <span className="text-sm text-gray-400">Drop image or click to upload</span>
        <span className="text-xs text-gray-600">PNG, JPG, WebP, GIF · max 10 MB</span>
      </div>
    )}

    {uploadState === 'error' && uploadError && (
      <p className="text-xs text-red-400 -mt-2">{uploadError}</p>
    )}

    <textarea
```

- [ ] **Step 6: Verify type check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 7: Manual smoke test**

```bash
npm run dev
```

- Open a quiz in the builder
- Expand a question card
- Confirm the image upload zone appears at the top
- Upload a small PNG — confirm spinner shows then image preview appears
- Confirm the `🖼` indicator appears in the collapsed header
- Click `×` on the preview — confirm image is removed

- [ ] **Step 8: Commit**

```bash
git add src/components/quiz/QuestionCard.tsx
git commit -m "feat: add image upload zone to QuestionCard"
```

---

## Task 10: Update HostView with image banner

**Files:**
- Modify: `src/components/HostView.tsx`

- [ ] **Step 1: Add imageUrl to the question mapping**

Find the `pendingQuestions` mapping block (~line 64–72):
```ts
const qs: Question[] = (data.questions ?? []).map((q: any) => ({
  id: q.id,
  text: q.text,
  options: q.options,
  correctIndex: q.correct_index,
  timeLimit: q.time_limit_sec * 1000,
  pointMultiplier: q.point_multiplier,
}));
```

Replace with:
```ts
const qs: Question[] = (data.questions ?? []).map((q: any) => ({
  id: q.id,
  text: q.text,
  options: q.options,
  correctIndex: q.correct_index,
  timeLimit: q.time_limit_sec * 1000,
  pointMultiplier: q.point_multiplier,
  imageUrl: q.image_url ?? undefined,
}));
```

- [ ] **Step 2: Add the image banner in the QUESTION_ACTIVE section**

Find the question text heading (~line 187):
```tsx
<h2 className="text-5xl md:text-6xl font-light italic text-center mb-16 leading-tight">
  {question.text}
</h2>
```

Replace with:
```tsx
{question.imageUrl && (
  <div className="w-full rounded-2xl overflow-hidden mb-8" style={{ maxHeight: '40vh' }}>
    <img
      src={question.imageUrl}
      alt=""
      className="w-full object-cover"
      style={{ maxHeight: '40vh' }}
    />
  </div>
)}
<h2 className="text-5xl md:text-6xl font-light italic text-center mb-16 leading-tight">
  {question.text}
</h2>
```

- [ ] **Step 3: Verify type check**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Manual end-to-end test**

```bash
npm run dev
```

- Open two browser tabs: one as host (`/host?quiz=<id>`), one as player (`/join`)
- Start a game with a question that has an image uploaded
- Confirm the image renders as a full-width banner above the question text on the host screen
- Confirm the player screen shows no image (answer buttons only)
- Start a game with a question that has **no** image — confirm layout is unchanged

- [ ] **Step 5: Commit**

```bash
git add src/components/HostView.tsx
git commit -m "feat: render question image banner on host screen during gameplay"
```

---

## Done

All tasks complete. Run a final type check:

```bash
npm run lint
```

The feature is fully implemented. Questions with images show:
1. An upload zone in the quiz builder (drag-and-drop, preview, delete)
2. A full-width image banner on the host screen during live questions
