# Morning Countdown Clock — Implementation Plan

> **For agentic workers:** implement task-by-task, TDD where noted. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A full-screen pie-clock overlay on the chore dashboard that appears after idle time on weekday mornings, showing elapsed vs remaining time in two colours, dismissed by any tap, with all timings configurable in the PIN-gated admin.

**Architecture:** Pure time logic in `src/lib/countdown.ts` (unit-tested). A `useIdleOverlay` hook drives the 3-minute idle timer. A `CountdownOverlay` SVG component renders the pie. Both wired into `src/app/page.tsx`, gated by settings read from the existing `/api/settings` key/value store. A new `CountdownTab` edits the settings.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind, Jest (ts-jest, node env). No new dependencies, no DB schema change.

**Working dir:** `C:\Users\Nick Gissing\Claude Code`. Branch: `feat/countdown-clock` (already created; spec already committed).

**Conventions:** tests live in `src/lib/__tests__/*.test.ts` and import with relative paths (e.g. `from '../countdown'`). Only `lib` logic is unit-tested; React components are verified via the dev preview.

---

### Task 1: Pure countdown logic (TDD)

**Files:**
- Create: `src/lib/countdown.ts`
- Test: `src/lib/__tests__/countdown.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/__tests__/countdown.test.ts`:

```ts
import {
  parseCountdownSettings,
  computeCountdownState,
  DEFAULTS,
} from '../countdown'

// A fixed weekday (Wed 2026-09-09) and weekend (Sat 2026-09-12) in local time.
const wedAt = (h: number, m: number) => new Date(2026, 8, 9, h, m, 0)
const satAt = (h: number, m: number) => new Date(2026, 8, 12, h, m, 0)

describe('parseCountdownSettings', () => {
  it('returns defaults when the map is empty or undefined', () => {
    const s = parseCountdownSettings(undefined)
    expect(s.enabled).toBe(true)
    expect(s.idleMinutes).toBe(3)
    expect(s.startMinutes).toBe(6 * 60)
    expect(s.targetMinutes).toBe(7 * 60 + 50)
    expect(s.offMinutes).toBe(8 * 60 + 30)
    expect(s.colorElapsed).toBe(DEFAULTS.colorElapsed)
    expect(s.colorRemaining).toBe(DEFAULTS.colorRemaining)
  })

  it('parses provided values', () => {
    const s = parseCountdownSettings({
      countdown_enabled: '0',
      countdown_idle_minutes: '5',
      countdown_start_time: '05:30',
      countdown_target_time: '08:00',
      countdown_off_time: '09:15',
      countdown_color_elapsed: '#123456',
      countdown_color_remaining: '#abcdef',
    })
    expect(s.enabled).toBe(false)
    expect(s.idleMinutes).toBe(5)
    expect(s.startMinutes).toBe(5 * 60 + 30)
    expect(s.targetMinutes).toBe(8 * 60)
    expect(s.offMinutes).toBe(9 * 60 + 15)
    expect(s.colorElapsed).toBe('#123456')
    expect(s.colorRemaining).toBe('#abcdef')
  })

  it('falls back to defaults for invalid values', () => {
    const s = parseCountdownSettings({
      countdown_idle_minutes: 'abc',
      countdown_start_time: '99:99',
      countdown_target_time: 'nope',
      countdown_color_elapsed: 'red',
    })
    expect(s.idleMinutes).toBe(3)
    expect(s.startMinutes).toBe(6 * 60)
    expect(s.targetMinutes).toBe(7 * 60 + 50)
    expect(s.colorElapsed).toBe(DEFAULTS.colorElapsed)
  })

  it('clamps idle minutes to at least 1', () => {
    expect(parseCountdownSettings({ countdown_idle_minutes: '0' }).idleMinutes).toBe(1)
    expect(parseCountdownSettings({ countdown_idle_minutes: '-4' }).idleMinutes).toBe(1)
  })
})

describe('computeCountdownState', () => {
  const s = parseCountdownSettings(undefined) // 06:00 / 07:50 / 08:30

  it('is inactive on weekends', () => {
    expect(computeCountdownState(s, satAt(7, 0)).phase).toBe('inactive')
  })

  it('is inactive before start and at/after off', () => {
    expect(computeCountdownState(s, wedAt(5, 59)).phase).toBe('inactive')
    expect(computeCountdownState(s, wedAt(8, 30)).phase).toBe('inactive')
    expect(computeCountdownState(s, wedAt(9, 0)).phase).toBe('inactive')
  })

  it('is inactive when disabled', () => {
    const off = { ...s, enabled: false }
    expect(computeCountdownState(off, wedAt(7, 0)).phase).toBe('inactive')
  })

  it('counts from start (0%) to target (approaching 100%)', () => {
    const atStart = computeCountdownState(s, wedAt(6, 0))
    expect(atStart.phase).toBe('counting')
    expect(atStart.elapsedFraction).toBeCloseTo(0, 5)
    expect(atStart.minutesLeft).toBe(110)

    const mid = computeCountdownState(s, wedAt(6, 55)) // 55 of 110 min
    expect(mid.phase).toBe('counting')
    expect(mid.elapsedFraction).toBeCloseTo(0.5, 2)
    expect(mid.minutesLeft).toBe(55)

    const near = computeCountdownState(s, wedAt(7, 49))
    expect(near.phase).toBe('counting')
    expect(near.minutesLeft).toBe(1)
  })

  it('is timesup at and after target until off', () => {
    const at = computeCountdownState(s, wedAt(7, 50))
    expect(at.phase).toBe('timesup')
    expect(at.elapsedFraction).toBe(1)
    expect(at.minutesLeft).toBe(0)
    expect(computeCountdownState(s, wedAt(8, 15)).phase).toBe('timesup')
  })

  it('guards against target <= start (no divide by zero)', () => {
    const bad = { ...s, startMinutes: 8 * 60, targetMinutes: 6 * 60 }
    // now inside a made-up window start..off; fraction must be finite
    const st = computeCountdownState({ ...bad, offMinutes: 9 * 60 }, wedAt(8, 30))
    expect(Number.isFinite(st.elapsedFraction)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/lib/__tests__/countdown.test.ts`
Expected: FAIL — cannot find module '../countdown'.

- [ ] **Step 3: Implement `src/lib/countdown.ts`**

```ts
export interface CountdownSettings {
  enabled: boolean
  idleMinutes: number
  startMinutes: number
  targetMinutes: number
  offMinutes: number
  colorElapsed: string
  colorRemaining: string
}

export type CountdownPhase = 'inactive' | 'counting' | 'timesup'

export interface CountdownState {
  phase: CountdownPhase
  elapsedFraction: number
  minutesLeft: number
}

export const DEFAULTS = {
  enabled: true,
  idleMinutes: 3,
  startMinutes: 6 * 60,
  targetMinutes: 7 * 60 + 50,
  offMinutes: 8 * 60 + 30,
  colorElapsed: '#E8956A',
  colorRemaining: '#2FB187',
}

function parseTime(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return fallback
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return fallback
  return h * 60 + min
}

function parseColor(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : fallback
}

export function parseCountdownSettings(raw: Record<string, string> | undefined): CountdownSettings {
  const r = raw ?? {}
  const idle = Math.floor(Number(r.countdown_idle_minutes))
  return {
    enabled: r.countdown_enabled !== '0',
    idleMinutes: Number.isFinite(idle) && idle >= 1 ? idle : DEFAULTS.idleMinutes,
    startMinutes: parseTime(r.countdown_start_time, DEFAULTS.startMinutes),
    targetMinutes: parseTime(r.countdown_target_time, DEFAULTS.targetMinutes),
    offMinutes: parseTime(r.countdown_off_time, DEFAULTS.offMinutes),
    colorElapsed: parseColor(r.countdown_color_elapsed, DEFAULTS.colorElapsed),
    colorRemaining: parseColor(r.countdown_color_remaining, DEFAULTS.colorRemaining),
  }
}

export function computeCountdownState(s: CountdownSettings, now: Date): CountdownState {
  const inactive: CountdownState = { phase: 'inactive', elapsedFraction: 0, minutesLeft: 0 }
  if (!s.enabled) return inactive

  const day = now.getDay()
  if (day === 0 || day === 6) return inactive

  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
  if (nowMin < s.startMinutes || nowMin >= s.offMinutes) return inactive

  if (nowMin >= s.targetMinutes) {
    return { phase: 'timesup', elapsedFraction: 1, minutesLeft: 0 }
  }

  const span = s.targetMinutes - s.startMinutes
  const fraction = span > 0 ? Math.min(1, Math.max(0, (nowMin - s.startMinutes) / span)) : 1
  const minutesLeft = Math.max(0, Math.ceil(s.targetMinutes - nowMin))
  return { phase: 'counting', elapsedFraction: fraction, minutesLeft }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest src/lib/__tests__/countdown.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/countdown.ts src/lib/__tests__/countdown.test.ts
git commit -m "feat: add pure morning-countdown time logic with tests"
```

---

### Task 2: Extend settings API whitelist

**Files:**
- Modify: `src/app/api/settings/route.ts` (the `allowed` array)

- [ ] **Step 1: Update the `allowed` whitelist**

Replace the line:

```ts
  const allowed = ['morning_start_time', 'afternoon_start_time', 'daily_reset_time']
```

with:

```ts
  const allowed = [
    'morning_start_time', 'afternoon_start_time', 'daily_reset_time',
    'countdown_enabled', 'countdown_idle_minutes',
    'countdown_start_time', 'countdown_target_time', 'countdown_off_time',
    'countdown_color_elapsed', 'countdown_color_remaining',
  ]
```

(The existing loop `for (const key of allowed) { if (body[key] !== undefined) upsert.run(key, body[key]) }` already handles persistence. Values are validated leniently on read by `parseCountdownSettings`, matching the app's existing approach.)

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/settings/route.ts
git commit -m "feat: allow countdown_* keys through the settings API"
```

---

### Task 3: Idle overlay hook

**Files:**
- Create: `src/hooks/useIdleOverlay.ts`

- [ ] **Step 1: Implement the hook**

```ts
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Shows an overlay after `idleMinutes` of no pointer/keyboard activity,
 * but only while `active` is true. dismiss() hides it and restarts the timer.
 * When `active` flips to false, any visible overlay is hidden immediately.
 */
export function useIdleOverlay(idleMinutes: number, active: boolean) {
  const [visible, setVisible] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  const arm = useCallback(() => {
    clear()
    if (!active) return
    timer.current = setTimeout(() => setVisible(true), Math.max(1, idleMinutes) * 60_000)
  }, [idleMinutes, active])

  const dismiss = useCallback(() => {
    setVisible(false)
    arm()
  }, [arm])

  // Hide immediately and disarm when the feature becomes inactive.
  useEffect(() => {
    if (!active) {
      setVisible(false)
      clear()
    } else {
      arm()
    }
  }, [active, arm])

  // Reset the idle timer on activity, but not while the overlay is showing
  // (its own dismiss handles that; ignoring events here avoids double-arming).
  useEffect(() => {
    if (!active) return
    const onActivity = () => {
      if (!visible) arm()
    }
    const events = ['pointerdown', 'keydown', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    return () => events.forEach((e) => window.removeEventListener(e, onActivity))
  }, [active, visible, arm])

  useEffect(() => () => clear(), [])

  return { visible, dismiss }
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useIdleOverlay.ts
git commit -m "feat: add idle-overlay hook with active-gating and dismiss"
```

---

### Task 4: Countdown overlay component

**Files:**
- Create: `src/components/CountdownOverlay.tsx`

- [ ] **Step 1: Implement the component**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { CountdownSettings, computeCountdownState } from '@/lib/countdown'

function polar(cx: number, cy: number, r: number, p: number) {
  const a = 2 * Math.PI * p
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) }
}

function wedge(cx: number, cy: number, r: number, p0: number, p1: number) {
  const a = polar(cx, cy, r, p0)
  const b = polar(cx, cy, r, p1)
  const large = p1 - p0 > 0.5 ? 1 : 0
  return `M ${cx} ${cy} L ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)} Z`
}

function fmtClock(d: Date) {
  let h = d.getHours() % 12
  if (h === 0) h = 12
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fmtTarget(minutes: number) {
  let h = Math.floor(minutes / 60) % 12
  if (h === 0) h = 12
  return `${h}:${String(minutes % 60).padStart(2, '0')}`
}

export default function CountdownOverlay({
  settings,
  onDismiss,
}: {
  settings: CountdownSettings
  onDismiss: () => void
}) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const state = computeCountdownState(settings, now)
  const cx = 150
  const cy = 150
  const r = 130
  const f = state.elapsedFraction

  const handleDown = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onDismiss()
  }

  return (
    <div
      onPointerDown={handleDown}
      className="fixed inset-0 flex flex-col items-center justify-center gap-6"
      style={{ zIndex: 9999, background: '#0b0b14', touchAction: 'none' }}
    >
      {state.phase === 'counting' && (
        <div className="text-white font-bold" style={{ fontFamily: 'var(--font-fredoka)', fontSize: '4rem', lineHeight: 1 }}>
          {fmtClock(now)}
        </div>
      )}

      <svg width="300" height="300" viewBox="0 0 300 300" aria-hidden="true">
        <circle cx={cx} cy={cy} r={r} fill="#15151f" stroke="#26263a" strokeWidth="3" />
        {f <= 0 ? (
          <circle cx={cx} cy={cy} r={r} fill={settings.colorRemaining} />
        ) : f >= 1 ? (
          <circle cx={cx} cy={cy} r={r} fill={settings.colorElapsed} />
        ) : (
          <>
            <path d={wedge(cx, cy, r, 0, f)} fill={settings.colorElapsed} />
            <path d={wedge(cx, cy, r, f, 1)} fill={settings.colorRemaining} />
          </>
        )}
        {[0, 0.25, 0.5, 0.75].map((p) => {
          const o = polar(cx, cy, r, p)
          const i = polar(cx, cy, r - 12, p)
          return <line key={p} x1={o.x} y1={o.y} x2={i.x} y2={i.y} stroke="#ffffff" strokeWidth="3" opacity="0.35" />
        })}
        {state.phase === 'counting' && (
          <>
            {(() => {
              const h = polar(cx, cy, r - 16, f)
              return <line x1={cx} y1={cy} x2={h.x} y2={h.y} stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
            })()}
            <circle cx={cx} cy={cy} r="10" fill="#ffffff" />
          </>
        )}
      </svg>

      {state.phase === 'counting' ? (
        <div className="text-center">
          <div className="text-white font-bold" style={{ fontFamily: 'var(--font-fredoka)', fontSize: '1.6rem' }}>
            School by {fmtTarget(settings.targetMinutes)}
          </div>
          <div style={{ color: settings.colorRemaining, fontSize: '1.2rem', fontWeight: 700 }}>
            {state.minutesLeft} min left
          </div>
        </div>
      ) : (
        <div className="text-white font-bold" style={{ fontFamily: 'var(--font-fredoka)', fontSize: '2.5rem' }}>
          Time&apos;s up!
        </div>
      )}

      <div className="text-white/30 text-sm">tap anywhere to close</div>
    </div>
  )
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/CountdownOverlay.tsx
git commit -m "feat: add pie-clock countdown overlay component"
```

---

### Task 5: Wire the overlay into the home page

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add imports** (after the existing component imports near the top)

```tsx
import CountdownOverlay from '@/components/CountdownOverlay'
import { useIdleOverlay } from '@/hooks/useIdleOverlay'
import { parseCountdownSettings, computeCountdownState } from '@/lib/countdown'
```

- [ ] **Step 2: Compute countdown state + overlay** — inside `HomePage`, after `const { data: settings } = useSWR(...)` and the `routine` line, add:

```tsx
  const countdown = parseCountdownSettings(settings)
  const [cdNow, setCdNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setCdNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])
  const cdActive = countdown.enabled && computeCountdownState(countdown, cdNow).phase !== 'inactive'
  const { visible: cdVisible, dismiss: cdDismiss } = useIdleOverlay(countdown.idleMinutes, cdActive)
```

(`useState` and `useEffect` are already imported in `page.tsx`.)

- [ ] **Step 3: Render the overlay** — just before the final closing `</div>` of the returned root element (after the bottom `MemberSelector` block), add:

```tsx
      {cdVisible && <CountdownOverlay settings={countdown} onDismiss={cdDismiss} />}
```

- [ ] **Step 4: Verify build + tests**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npm test`
Expected: all suites pass (countdown + existing).

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: show countdown overlay on the chore dashboard when idle"
```

---

### Task 6: Admin Countdown tab

**Files:**
- Create: `src/components/admin/CountdownTab.tsx`
- Modify: `src/components/admin/AdminShell.tsx`

- [ ] **Step 1: Implement `CountdownTab.tsx`**

```tsx
'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { parseCountdownSettings } from '@/lib/countdown'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function CountdownTab() {
  const { data: settings, mutate } = useSWR<Record<string, string>>('/api/settings', fetcher)
  const [form, setForm] = useState<Record<string, string> | null>(null)
  const current = form ?? settings ?? {}

  const set = (key: string, value: string) =>
    setForm((f) => ({ ...(f ?? settings ?? {}), [key]: value }))

  const save = async () => {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(current),
    })
    mutate()
    setForm(null)
  }

  const cd = parseCountdownSettings(current)
  const enabled = (current.countdown_enabled ?? '1') !== '0'
  const previewFraction = 0.55 // sample for the swatch preview

  const times: { key: string; label: string; fallback: string }[] = [
    { key: 'countdown_start_time', label: '☀️ Start', fallback: '06:00' },
    { key: 'countdown_target_time', label: '🎯 Count down to', fallback: '07:50' },
    { key: 'countdown_off_time', label: '🌙 Turn off after', fallback: '08:30' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'var(--font-fredoka)' }}>
        Countdown clock
      </h2>

      <label className="flex items-center gap-3 text-white/80 font-bold text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => set('countdown_enabled', e.target.checked ? '1' : '0')}
          style={{ width: 20, height: 20 }}
        />
        Show the morning countdown overlay
      </label>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-white/60 font-bold">⏳ Appear after (minutes idle)</label>
        <input
          type="number"
          min={1}
          value={current.countdown_idle_minutes ?? '3'}
          onChange={(e) => set('countdown_idle_minutes', e.target.value)}
          className="px-4 py-3 rounded-xl bg-white/10 text-white outline-none border border-white/10 text-lg w-40"
        />
      </div>

      {times.map(({ key, label, fallback }) => (
        <div key={key} className="flex flex-col gap-1">
          <label className="text-sm text-white/60 font-bold">{label}</label>
          <input
            type="time"
            value={current[key] ?? fallback}
            onChange={(e) => set(key, e.target.value)}
            className="px-4 py-3 rounded-xl bg-white/10 text-white outline-none border border-white/10 text-lg w-40"
          />
        </div>
      ))}

      <div className="flex gap-6">
        <div className="flex flex-col gap-1">
          <label className="text-sm text-white/60 font-bold">Time gone</label>
          <input type="color" value={cd.colorElapsed}
            onChange={(e) => set('countdown_color_elapsed', e.target.value)}
            className="w-16 h-12 rounded-lg bg-transparent border border-white/10" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm text-white/60 font-bold">Time left</label>
          <input type="color" value={cd.colorRemaining}
            onChange={(e) => set('countdown_color_remaining', e.target.value)}
            className="w-16 h-12 rounded-lg bg-transparent border border-white/10" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <label className="text-sm text-white/60 font-bold">Preview</label>
          <svg width="48" height="48" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="22" fill={cd.colorRemaining} />
            <path
              d={(() => {
                const a = 2 * Math.PI * previewFraction
                const x = 24 + 22 * Math.sin(a)
                const y = 24 - 22 * Math.cos(a)
                const large = previewFraction > 0.5 ? 1 : 0
                return `M 24 24 L 24 2 A 22 22 0 ${large} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`
              })()}
              fill={cd.colorElapsed}
            />
          </svg>
        </div>
      </div>

      <button onClick={save}
        className="px-6 py-3 rounded-xl text-sm font-bold text-white w-40"
        style={{ background: '#6366f1' }}>
        Save
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Register the tab in `AdminShell.tsx`**

Add the import near the other tab imports:

```tsx
import CountdownTab from './CountdownTab'
```

Extend the `Tab` type:

```tsx
type Tab = 'members' | 'chores' | 'schedule' | 'points' | 'pin' | 'gold' | 'countdown'
```

Add to the `TABS` array (after the `schedule` entry):

```tsx
  { id: 'countdown', label: 'Countdown',    icon: '⏳' },
```

Add to the tab-content switch (after the `schedule` line):

```tsx
        {tab === 'countdown' && <CountdownTab />}
```

- [ ] **Step 3: Verify build + tests**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npm test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/CountdownTab.tsx src/components/admin/AdminShell.tsx
git commit -m "feat: add admin Countdown tab for overlay settings"
```

---

### Task 7: Manual verification + finish

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: compiles, `/` and `/admin` build.

- [ ] **Step 2: Preview-test** (dev server)

- Start the dev server; open `/admin` → Countdown tab; confirm the settings render and save (network PUT 200, values persist on reload).
- Temporarily set the start/target/off window to bracket the current time and idle-minutes to 1 (or drive via a temporary override) to confirm: overlay appears after idle, pie shows two-tone split with hand, current time + "min left" update, tap dismisses without toggling a chore, and it does not reappear until idle again.
- Confirm outside-window/weekend → overlay never appears; at/after target within window → "Time's up!".
- Reset the settings to defaults (06:00 / 07:50 / 08:30 / 3 min) after testing.

- [ ] **Step 3: Final verification**

Run: `npm run lint` → no errors.
Run: `npm test` → all pass.
Run: `npm run build` → succeeds.

- [ ] **Step 4: Spec coverage check**

Re-read the spec; confirm each section (states, settings keys, pure logic, hook, overlay, admin tab, tests) is implemented.
