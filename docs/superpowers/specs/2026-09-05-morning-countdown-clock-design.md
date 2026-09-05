# Morning Countdown Clock — Design Spec

**Date:** 2026-09-05
**Status:** Approved
**App:** family-chore-app (Next.js 14, `C:\Users\Nick Gissing\Claude Code`)

## Overview

A full-screen "pie clock" overlay for the kitchen chore dashboard that helps kids see how much of the morning is left before school. The whole circle represents the morning window (default 6:00→7:50am on weekdays). A coloured wedge shows time elapsed vs time remaining. It appears automatically after a period of no activity (default 3 minutes) and dismisses on any tap. All timings are configurable in the PIN-gated admin.

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Clock style | Pie clock — solid two-tone wedges + sweeping hand, whole circle = the morning window |
| Outside the morning window | Overlay does not appear (weekends, before start, after "turn off" time) |
| At target time | Full circle in the elapsed colour + "Time's up!" message, until the turn-off time |
| Days | Weekdays only (Mon–Fri), fixed (not user-configurable in v1) |
| Settings home | New PIN-gated "Countdown" tab in admin |
| Dismiss | Any tap/click anywhere hides the overlay and is swallowed (does not toggle a chore) |

## Behaviour

### Active window (weekdays only)

Let `start` = 06:00, `target` = 07:50, `off` = 08:30 (all configurable). Times compared in the device's local time. `getDay()` 1–5 = Mon–Fri.

- **Before `start`, after `off`, or on weekends** → phase `inactive`: idle never shows the overlay.
- **`start` ≤ now < `target`** → phase `counting`: the overlay is eligible. `elapsedFraction = (now − start) / (target − start)`, clamped 0–1. Pie fills clockwise from 12 o'clock: elapsed wedge in the "time-gone" colour, remaining wedge in the "time-left" colour, a hand at the boundary. Shows large current time and a "School by 7:50" style label.
- **`target` ≤ now < `off`** → phase `timesup`: overlay eligible, full circle in the time-gone colour, "Time's up!" message.

### Idle / dismiss

- The overlay only appears on the main chore screen (`/`), never on `/admin` or `/cashin`.
- Activity = any `pointerdown` / `keydown` / `touchstart` on the window. Each resets an idle timer of `idleMinutes` (default 3).
- When the idle timer fires AND the current phase is `counting` or `timesup` AND the feature is enabled → show the overlay.
- While the overlay is shown, a `pointerdown` anywhere hides it, is prevented from propagating (so it does not toggle a chore underneath), and restarts the idle timer.
- If the phase transitions to `inactive` while the overlay is shown (e.g. clock passes `off`), the overlay hides itself.

## Settings

Stored as string values in the existing `settings` key/value table. Added to the `PUT /api/settings` `allowed` whitelist. The home page and the admin tab read them via the existing `/api/settings` SWR endpoint.

| Key | Default | Meaning |
|-----|---------|---------|
| `countdown_enabled` | `'1'` | `'1'`/`'0'` — feature on/off |
| `countdown_idle_minutes` | `'3'` | Minutes of no activity before the overlay appears |
| `countdown_start_time` | `'06:00'` | Countdown start (HH:MM, 24h) |
| `countdown_target_time` | `'07:50'` | Countdown target — hits zero here |
| `countdown_off_time` | `'08:30'` | Overlay stops appearing after this |
| `countdown_color_elapsed` | `'#E8956A'` | "Time gone" wedge colour |
| `countdown_color_remaining` | `'#2FB187'` | "Time left" wedge colour |

Defaults are applied in code when a key is absent, so no migration/seed is required (a fresh DB with no `countdown_*` rows behaves as all-defaults, enabled).

### Validation

- `PUT /api/settings` extends `allowed` with the seven keys above. Time strings validated as `HH:MM`; `countdown_idle_minutes` coerced to an integer ≥ 1; colours validated as `#RRGGBB`. Invalid values are ignored (the existing value / default stands), consistent with the current lenient handler.

## Pure logic — `src/lib/countdown.ts`

The single source of truth, fully unit-tested (Jest, node env, matching `src/lib/__tests__` style).

```ts
export interface CountdownSettings {
  enabled: boolean
  idleMinutes: number
  startMinutes: number   // minutes since midnight
  targetMinutes: number
  offMinutes: number
  colorElapsed: string
  colorRemaining: string
}

export type CountdownPhase = 'inactive' | 'counting' | 'timesup'

export interface CountdownState {
  phase: CountdownPhase
  elapsedFraction: number  // 0..1
  minutesLeft: number      // whole minutes to target, >= 0
}

// Parse the raw settings map (string keys) into typed settings with defaults.
export function parseCountdownSettings(raw: Record<string, string> | undefined): CountdownSettings

// Given typed settings and a Date, compute the current state.
export function computeCountdownState(settings: CountdownSettings, now: Date): CountdownState
```

Rules:
- `phase = 'inactive'` when `!enabled`, on weekends (`day === 0 || day === 6`), or when `nowMinutes < startMinutes` or `nowMinutes >= offMinutes`.
- `phase = 'counting'` when `startMinutes <= nowMinutes < targetMinutes`.
- `phase = 'timesup'` when `targetMinutes <= nowMinutes < offMinutes`.
- `elapsedFraction` clamped 0–1; equals 1 during `timesup`.
- `minutesLeft = max(0, ceil(targetMinutes − nowMinutes))` during `counting`, else 0.
- Guard against misconfiguration where `targetMinutes <= startMinutes` (avoid divide-by-zero → treat fraction as 1).

## UI

### `useIdleOverlay(idleMinutes, active)` — `src/hooks/useIdleOverlay.ts`

Returns `{ visible, dismiss }`. Internally: a ref-based timer reset on window activity events; sets `visible=true` when the timer fires and `active` is true; `dismiss()` sets `visible=false` and restarts the timer. Cleans up listeners on unmount. `active=false` (feature disabled / inactive phase) keeps it hidden and the timer idle.

### `CountdownOverlay` — `src/components/CountdownOverlay.tsx`

- `position: fixed; inset: 0; z-index: 9999`, dark translucent/opaque background (screensaver feel, low burn-in).
- Re-computes `computeCountdownState` every second via a 1s interval (for smooth sweep + minute updates).
- Renders an SVG pie (two wedge `path`s + hand + hub + hour ticks), sized to the smaller screen dimension.
- `counting`: large current time (HH:MM) above the pie, "School by {target}" label below.
- `timesup`: full elapsed-colour circle, "Time's up!" headline.
- `onPointerDown`: `e.preventDefault()` + `e.stopPropagation()` + call `dismiss()`.

### Wiring in `src/app/page.tsx`

- Read `settings` (already fetched via SWR).
- `const cd = parseCountdownSettings(settings)`; `const state = computeCountdownState(cd, new Date())` — recomputed on a 1-min tick to update `active`.
- `const active = cd.enabled && state.phase !== 'inactive'`.
- `const { visible, dismiss } = useIdleOverlay(cd.idleMinutes, active)`.
- Render `{visible && <CountdownOverlay settings={cd} onDismiss={dismiss} />}`.

## Admin — `src/components/admin/CountdownTab.tsx`

New tab registered in `AdminShell`, mirroring `ScheduleTab`'s save pattern (`useSWR('/api/settings')`, local `form` state, `PUT` on save):
- Enable toggle
- Idle minutes (number input, min 1)
- Start / Target / Turn-off (three `type="time"` inputs)
- Two colour pickers (`type="color"`) with a small live pie preview
- Save button

## Testing

Jest (existing config). External-free, deterministic.

- `parseCountdownSettings`: defaults when empty; parses each key; `'0'`→disabled; bad numbers/times fall back to defaults.
- `computeCountdownState`: weekend → inactive; before start → inactive; at start → counting 0%; midpoint → ~0.5; just before target → ~1 with `minutesLeft` correct; at target → timesup, fraction 1; between target and off → timesup; at/after off → inactive; `target <= start` guard.
- Boundary exactness (e.g. `now == startMinutes` is counting; `now == targetMinutes` is timesup; `now == offMinutes` is inactive).

UI components (`useIdleOverlay`, `CountdownOverlay`) are not unit-tested in the node env (consistent with the app, which tests `lib` logic, not React components); verified manually via the dev preview.

## Out of scope (YAGNI)

- Per-day-of-week schedules or holiday awareness
- Sound/alarm at target
- Multiple countdowns / afternoon countdown
- Animating the hand with sub-second easing (1s tick is enough)
- Overlay on admin/cash-in screens
