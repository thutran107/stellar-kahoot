# Question Image Upload — Design Spec

**Date:** 2026-05-11  
**Status:** Approved

## Overview

Add optional per-question image support to StellarTrivia. Images are uploaded to Supabase Storage during quiz editing and displayed as a full-width banner on the host screen during live gameplay. Player screens are unaffected.

## Constraints

- Allowed types: JPEG, PNG, WebP, GIF (including animated)
- Max file size: 10 MB
- Images are optional — questions without images behave exactly as today
- Images appear on the host screen only (not player phones)

## Data Layer

### Supabase Storage

- Bucket name: `question-images`
- Access: public read (CDN URL embedded in game state broadcasts)
- File path pattern: `{quizId}/{questionId}/{timestamp}-{originalFilename}`
- Namespacing per quiz makes per-quiz cleanup straightforward

### Database

```sql
ALTER TABLE questions ADD COLUMN image_url TEXT;
```

Nullable. Null means no image set.

### TypeScript interfaces

`src/store.ts` — `Question`:
```ts
imageUrl?: string;
```

`QuestionCard.tsx` — `QuestionData`:
```ts
image_url?: string;
```

## Upload API

**Route:** `POST /api/upload/question-image`  
**Auth:** same auth middleware as existing quiz routes  
**Content-type:** `multipart/form-data`, field name `file`

**Server-side validation:**
- MIME type must be one of: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- File size must not exceed 10 MB
- Returns `400` with a descriptive error message on validation failure

**Happy path:**
1. Parse file with `multer` (in-memory storage)
2. Upload buffer to Supabase Storage via `supabaseAdmin.storage.from('question-images').upload(path, buffer, { contentType, upsert: false })`
3. Retrieve public URL via `supabaseAdmin.storage.from('question-images').getPublicUrl(path)`
4. Return `{ url: string }`

**Existing route change:** `PATCH /api/quizzes/questions/:qid` — add `image_url` to the `allowed` fields array so it can be set and cleared.

## Quiz Builder UI (QuestionCard)

Image zone renders at the top of the expanded card, above the question textarea.

### States

**No image:**  
Dashed border drop zone. Camera icon + "Drop image or click to upload" label. Subtitle: "PNG, JPG, WebP, GIF · max 10 MB". Clicking opens a hidden `<input type="file" accept="image/jpeg,image/png,image/webp,image/gif">`. Drag-and-drop onto the zone also triggers upload.

**Uploading:**  
Drop zone replaced by a centered spinner. No other controls disabled.

**Image set:**  
Image preview at fixed height (~160px), `object-fit: cover`. Delete button (`×`) in top-right corner of the preview.

**Error:**  
Inline error message below the zone (e.g. "File too large — max 10 MB", "Unsupported file type"). Clears on next upload attempt.

### Collapsed header indicator

When `image_url` is set, a small image icon badge appears in the collapsed card header row, letting the user scan all questions and see which ones have images without expanding each.

### Upload flow

1. File selected or dropped → client-side validate type + size → show spinner
2. `POST /api/upload/question-image` with `FormData`
3. On success: `updateQuestion(id, { image_url: url })` → preview renders
4. On error: show inline error message, reset to empty drop zone

### Delete flow

1. User clicks `×` on preview
2. `updateQuestion(id, { image_url: null })` → clears DB column
3. Client calls `DELETE /api/upload/question-image` with `{ url: storedUrl }` in the body
4. Server strips the Supabase Storage base URL prefix (`SUPABASE_URL/storage/v1/object/public/question-images/`) to recover the storage path, then calls `supabaseAdmin.storage.from('question-images').remove([path])`

## Host Screen (HostView) — Live Gameplay

When `gameState === 'QUESTION_ACTIVE'` and `question.imageUrl` is truthy:

- A full-width `<img>` renders above the question text
- Constrained to `max-height: 40vh`, `object-fit: cover`, rounded corners matching the theme
- When `question.imageUrl` is falsy: no element rendered, layout unchanged

### Data mapping change

In `HostView.tsx`, where the quiz API response is mapped to `Question[]`:
```ts
imageUrl: q.image_url ?? undefined,
```

No server-side socket changes needed — the full question object is already broadcast.

## Files Changed

| File | Change |
|---|---|
| Supabase dashboard | Create `question-images` public bucket (one-time manual step) |
| `server/routes/upload.ts` | New — upload + delete endpoints |
| `server/routes/quiz.ts` | Add `image_url` to PATCH allowed fields |
| `server.ts` | Mount upload router |
| `src/store.ts` | Add `imageUrl?: string` to `Question` |
| `src/components/quiz/QuestionCard.tsx` | Add `image_url` to `QuestionData`, image upload zone UI |
| `src/components/HostView.tsx` | Image mapping + full-width banner render |
| `package.json` | Add `multer` + `@types/multer` dependencies |
