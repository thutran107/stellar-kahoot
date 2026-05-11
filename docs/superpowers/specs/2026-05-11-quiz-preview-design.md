# Quiz Preview Modal — Design Spec

**Date:** 2026-05-11  
**Status:** Approved

## Overview

Add a preview mode to the quiz builder that lets the host step through their quiz as a simulated game before going live. The preview opens as a full-screen modal overlay on top of the builder — no navigation away, no extra API calls.

---

## Entry Point

A **Preview** button is added to the fixed bottom toolbar in `QuizBuilderPage`, alongside the existing "Add Question", "Import JSON", and "Mark as Ready" buttons. It uses the `Eye` icon from Lucide.

- Disabled when `questions.length === 0`
- On click: sets `previewOpen = true`, `previewIndex = 0`
- The builder stays mounted underneath

---

## Modal Structure

**Component:** `src/components/quiz/QuizPreviewModal.tsx`

**Props:**
```ts
interface Props {
  questions: QuestionData[];
  initialIndex: number;
  onClose: () => void;
}
```

**Internal state:** `index: number`, `revealed: boolean`

Rendered as `position: fixed inset-0` with a dark backdrop (`bg-black/85`). Layout top-to-bottom:

1. **Frozen timer bar** — full-width static gradient (cyan → indigo), with a "PREVIEW — TIMER PAUSED" label on the right. No animation.
2. **Header** — question counter on the left ("Question 2 of 5 · 20s · 2× pts"), X close button on the right.
3. **Body** (scrollable):
   - Optional image banner — shown if `image_url` is present, `object-contain`, max height 200px
   - Question text — large, italic, centered; same style as HostView's `QUESTION_ACTIVE` state
   - 2×2 answer tile grid — same red/blue/yellow/green color scheme as HostView
4. **Footer** — Prev button (left), single center slot that toggles between "Reveal Answer" (before reveal) and "Next →" (after reveal). No button on the right.

---

## Interaction Flow

Each question cycles through two states:

### Unrevealed
- All 4 answer tiles shown at full opacity in their default colors
- "Reveal Answer" button visible in the footer center
- Next button hidden

### Revealed
- Correct tile: highlighted green (`bg-neon-green/20`, `border-neon-green`, glow shadow)
- Other 3 tiles: dimmed to 35% opacity
- "Reveal Answer" button hidden
- "Next →" button appears in the footer center

### Advance
- Clicking Next (or pressing `→`) increments `index` and resets to Unrevealed
- On the last question: Next button label becomes "Finish" and calls `onClose`
- Prev is always available; navigating back resets `revealed` to `false` for that question

### Closing
- X button or Escape key calls `onClose` immediately — no confirmation dialog

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Escape` | Close modal |
| `→` / `ArrowRight` | Advance to next question (only after reveal) |

---

## Component Architecture

### New file
`src/components/quiz/QuizPreviewModal.tsx`
- Self-contained; no new npm dependencies
- Uses Tailwind classes already in the project
- Uses `useEffect` to register/unregister keyboard listeners

### Changes to existing files
**`src/components/quiz/QuizBuilderPage.tsx`:**
- Add `previewOpen: boolean` state (default `false`)
- Add `previewIndex: number` state (default `0`)
- Add Preview button to the bottom toolbar
- Conditionally render `<QuizPreviewModal>` when `previewOpen` is true

### No changes to
- `HostView.tsx`, `PlayerView.tsx`
- `store.ts`, `server.ts`
- Routes in `App.tsx`
- Any API endpoints

---

## What This Is Not

- Not a live game simulation (no socket, no scoring, no player joins)
- Not accessible from any route other than the quiz builder
- No timer countdown during preview
