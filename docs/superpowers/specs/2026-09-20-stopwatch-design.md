# Stopwatch — Design Spec

**Date:** 2026-09-20
**Status:** Approved
**App:** family-chore-app (`C:\Users\Nick Gissing\Claude Code`, ngissing/chores)

## Overview

A standalone stopwatch available on selected member profiles (Flynn to begin with). The member
taps Start, the elapsed time runs on a full-screen overlay, and Stop shows and saves the final
time. Runs are kept per member so a personal best can be highlighted.

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Purpose | Standalone stopwatch (not tied to chores) |
| Persistence | Save each run; track & highlight personal best |
| Display | Full-screen overlay, huge time, big Start/Stop |
| Which profiles | Per-member `stopwatch_enabled` toggle in admin; on for Flynn, off by default |
| Precision | Hundredths of a second (`M:SS.cs`) |
| Dismissal | Explicit Close (✕) button — no tap-to-close (avoids click-through) |

## Data

Additive migration in `src/lib/db.ts` (mirrors the existing `try { ALTER TABLE … } catch {}`
and `CREATE TABLE IF NOT EXISTS` patterns — safe on the Pi's existing database):

```sql
ALTER TABLE members ADD COLUMN stopwatch_enabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS stopwatch_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  duration_ms INTEGER NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stopwatch_runs_member ON stopwatch_runs(member_id);
```

## Pure logic — `src/lib/stopwatch.ts`

Unit-tested (Jest, matching `src/lib/__tests__` style).

```ts
// Format elapsed milliseconds as M:SS.cs (centiseconds). Minutes shown only when >= 1 min.
// e.g. 42190 -> "42.19", 83450 -> "1:23.45", 0 -> "0.00"
export function formatDuration(ms: number): string

// The smallest duration among runs, or null when there are none.
export function bestMs(runs: { duration_ms: number }[]): number | null

// True when `ms` beats every prior run (or there are none) — a new personal best.
export function isPersonalBest(ms: number, priorRuns: { duration_ms: number }[]): boolean
```

Rules:
- `formatDuration` clamps negatives to 0; centiseconds = `Math.floor((ms % 1000) / 10)`, zero-padded
  to 2; seconds zero-padded to 2 only when minutes are shown.
- `isPersonalBest(ms, prior)` → `true` if `prior` is empty or `ms < min(prior.duration_ms)`.

## API

`src/app/api/members/route.ts` — extend `PUT` to also persist `stopwatch_enabled` (coerced to 0/1).
`GET`/`POST` unchanged (POST leaves new members with the column default 0).

`src/app/api/stopwatch/route.ts` (new):
- `POST { member_id, duration_ms }` → validates both are finite numbers, inserts a run, returns
  `{ ok: true, best_ms }`.
- `GET ?member_id=<id>` → `{ runs: [{ duration_ms, created_at }] (latest 5), best_ms }`.

## UI

### Member type — `src/hooks/useMembers.ts`
Add `stopwatch_enabled?: number` to the `Member` type.

### Admin — `src/components/admin/MembersTab.tsx`
Add a checkbox to the edit modal: "⏱ Stopwatch enabled", bound to `editing.stopwatch_enabled`
(stored as 0/1). The existing `save()` already sends the whole `editing` object via PUT.

### Home screen — `src/app/page.tsx`
When `activeMember?.stopwatch_enabled` is truthy, render a ⏱ button in the top bar (next to the
settings gear). Tapping sets local state to open `<StopwatchOverlay member={activeMember} … />`.

### `src/components/StopwatchOverlay.tsx`
- `position: fixed; inset: 0; z-index: 9999`, dark background, member's colour as accent.
- State machine: `idle` → `running` → `stopped`.
  - `idle`: big "0.00", a large **Start** button, and best/recent history below.
  - `running`: live time updating ~every 30ms via `requestAnimationFrame`, computed as
    `Date.now() - startedAt` (timestamp delta, not tick counting, so it stays accurate), a large
    **Stop** button.
  - `stopped`: the frozen final time (large), a **Reset** button (→ idle) . On entering `stopped`
    it `POST`s the run; if `isPersonalBest`, fire `canvas-confetti` and show "New best! 🎉".
- Always visible: **Best: M:SS.cs** and the last few runs (from `GET /api/stopwatch`), refreshed
  after each save.
- A **✕ Close** button (top corner) exits the overlay. No tap-anywhere dismissal.
- Uses SWR or a manual fetch for the runs; simplest is a manual fetch on mount + after each save.

## Testing

- `formatDuration`: 0, sub-second, exactly 1s, minutes rollover, negative clamp, centisecond
  rounding (e.g. 1239 ms → "1.23").
- `bestMs`: empty → null; picks the minimum.
- `isPersonalBest`: empty prior → true; strictly-less → true; equal or slower → false.

UI (overlay, button, admin checkbox) verified via the dev preview; not unit-tested (consistent
with the app testing only `lib` logic).

## Out of scope (YAGNI)

- Laps / pause-resume (single start→stop run only)
- Countdown/interval timer modes
- Editing or deleting saved runs from the UI
- Points integration / linking runs to chores
- A full run-history screen (last-few + best inline is enough)
