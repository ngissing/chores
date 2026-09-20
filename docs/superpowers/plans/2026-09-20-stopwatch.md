# Stopwatch Implementation Plan

**Goal:** A per-profile standalone stopwatch (Flynn first) — full-screen overlay, Start/Stop, saved runs + personal best.

**Tech:** Next.js 14, better-sqlite3, Jest. Additive DB migration; no new deps. Branch: `feat/stopwatch`.

**Conventions:** `lib` logic unit-tested in `src/lib/__tests__/*.test.ts` (relative imports); components verified in preview.

---

### Task 1: Pure stopwatch logic (TDD)

**Files:** Create `src/lib/stopwatch.ts`, Test `src/lib/__tests__/stopwatch.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { formatDuration, bestMs, isPersonalBest } from '../stopwatch'

describe('formatDuration', () => {
  it('formats sub-minute as SS.cs', () => {
    expect(formatDuration(0)).toBe('0.00')
    expect(formatDuration(4200)).toBe('4.20')
    expect(formatDuration(42190)).toBe('42.19')
  })
  it('formats minutes as M:SS.cs', () => {
    expect(formatDuration(60000)).toBe('1:00.00')
    expect(formatDuration(83450)).toBe('1:23.45')
    expect(formatDuration(600000)).toBe('10:00.00')
  })
  it('floors centiseconds and clamps negatives', () => {
    expect(formatDuration(1239)).toBe('1.23')
    expect(formatDuration(-50)).toBe('0.00')
  })
})

describe('bestMs', () => {
  it('returns null for no runs', () => {
    expect(bestMs([])).toBeNull()
  })
  it('returns the minimum duration', () => {
    expect(bestMs([{ duration_ms: 5000 }, { duration_ms: 3200 }, { duration_ms: 9000 }])).toBe(3200)
  })
})

describe('isPersonalBest', () => {
  it('is true when there are no prior runs', () => {
    expect(isPersonalBest(5000, [])).toBe(true)
  })
  it('is true only when strictly faster than the best prior', () => {
    const prior = [{ duration_ms: 5000 }, { duration_ms: 4000 }]
    expect(isPersonalBest(3999, prior)).toBe(true)
    expect(isPersonalBest(4000, prior)).toBe(false)
    expect(isPersonalBest(4500, prior)).toBe(false)
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (`npx jest src/lib/__tests__/stopwatch.test.ts`)

- [ ] **Step 3: Implement `src/lib/stopwatch.ts`**

```ts
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms))
  const minutes = Math.floor(total / 60000)
  const seconds = Math.floor((total % 60000) / 1000)
  const cs = Math.floor((total % 1000) / 10)
  const cc = String(cs).padStart(2, '0')
  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, '0')}.${cc}`
  }
  return `${seconds}.${cc}`
}

export function bestMs(runs: { duration_ms: number }[]): number | null {
  if (runs.length === 0) return null
  return runs.reduce((min, r) => (r.duration_ms < min ? r.duration_ms : min), runs[0].duration_ms)
}

export function isPersonalBest(ms: number, priorRuns: { duration_ms: number }[]): boolean {
  const best = bestMs(priorRuns)
  return best === null || ms < best
}
```

- [ ] **Step 4: Run — expect PASS. Commit.**

```bash
git add src/lib/stopwatch.ts src/lib/__tests__/stopwatch.test.ts
git commit -m "feat: add pure stopwatch logic (format, best, personal-best) with tests"
```

---

### Task 2: DB migration

**Files:** Modify `src/lib/db.ts`

- [ ] **Step 1:** After the existing chore `note_*` migrations (before the `chore_member_images` CREATE), add:

```ts
  // Per-member stopwatch feature flag
  try {
    db.exec(`ALTER TABLE members ADD COLUMN stopwatch_enabled INTEGER NOT NULL DEFAULT 0`)
  } catch {
    // Column already exists — safe to ignore
  }

  // Saved stopwatch runs (per member)
  db.exec(`
    CREATE TABLE IF NOT EXISTS stopwatch_runs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      duration_ms INTEGER NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_stopwatch_runs_member ON stopwatch_runs(member_id);
  `)
```

- [ ] **Step 2:** `npx tsc --noEmit` clean. Commit.

```bash
git add src/lib/db.ts
git commit -m "feat: add stopwatch_enabled column and stopwatch_runs table"
```

---

### Task 3: Stopwatch API route

**Files:** Create `src/app/api/stopwatch/route.ts`

- [ ] **Step 1: Implement**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { bestMs } from '@/lib/stopwatch'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { member_id, duration_ms } = await req.json()
  if (!Number.isFinite(member_id) || !Number.isFinite(duration_ms) || duration_ms < 0) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }
  const db = getDb()
  db.prepare('INSERT INTO stopwatch_runs (member_id, duration_ms) VALUES (?, ?)').run(
    member_id,
    Math.floor(duration_ms)
  )
  const runs = db
    .prepare('SELECT duration_ms FROM stopwatch_runs WHERE member_id = ?')
    .all(member_id) as { duration_ms: number }[]
  return NextResponse.json({ ok: true, best_ms: bestMs(runs) })
}

export function GET(req: NextRequest) {
  const memberId = Number(req.nextUrl.searchParams.get('member_id'))
  if (!Number.isFinite(memberId)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }
  const db = getDb()
  const recent = db
    .prepare('SELECT duration_ms, created_at FROM stopwatch_runs WHERE member_id = ? ORDER BY id DESC LIMIT 5')
    .all(memberId) as { duration_ms: number; created_at: string }[]
  const all = db
    .prepare('SELECT duration_ms FROM stopwatch_runs WHERE member_id = ?')
    .all(memberId) as { duration_ms: number }[]
  return NextResponse.json({ runs: recent, best_ms: bestMs(all) })
}
```

- [ ] **Step 2:** `npx tsc --noEmit` clean. Commit.

```bash
git add src/app/api/stopwatch/route.ts
git commit -m "feat: add stopwatch runs API (save run, list recent + best)"
```

---

### Task 4: Persist stopwatch_enabled + Member type

**Files:** Modify `src/app/api/members/route.ts`, `src/hooks/useMembers.ts`

- [ ] **Step 1:** In `PUT`, include `stopwatch_enabled`:

```ts
export async function PUT(req: NextRequest) {
  const { id, name, age, colour, point_value_cents, appearance, stopwatch_enabled } = await req.json()
  getDb()
    .prepare('UPDATE members SET name=?, age=?, colour=?, point_value_cents=?, appearance=?, stopwatch_enabled=? WHERE id=?')
    .run(name, age, colour, point_value_cents, appearance ?? '', stopwatch_enabled ? 1 : 0, id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2:** In `src/hooks/useMembers.ts`, add `stopwatch_enabled?: number` to the `Member` type/interface (leave the rest unchanged).

- [ ] **Step 3:** `npx tsc --noEmit` clean. Commit.

```bash
git add src/app/api/members/route.ts src/hooks/useMembers.ts
git commit -m "feat: persist per-member stopwatch_enabled flag"
```

---

### Task 5: Admin checkbox

**Files:** Modify `src/components/admin/MembersTab.tsx`

- [ ] **Step 1:** In the edit modal, after the "Cents per point" field block and before the Cancel/Save row, add:

```tsx
            <label className="flex items-center gap-2 text-sm text-white/70 font-bold">
              <input
                type="checkbox"
                checked={!!editing.stopwatch_enabled}
                onChange={(e) => setEditing((p) => ({ ...p, stopwatch_enabled: e.target.checked ? 1 : 0 }))}
                style={{ width: 18, height: 18 }}
              />
              ⏱ Stopwatch enabled
            </label>
```

- [ ] **Step 2:** `npx tsc --noEmit` clean; `npm run lint` clean. Commit.

```bash
git add src/components/admin/MembersTab.tsx
git commit -m "feat: add stopwatch-enabled toggle to member editor"
```

---

### Task 6: Stopwatch overlay + home button

**Files:** Create `src/components/StopwatchOverlay.tsx`, Modify `src/app/page.tsx`

- [ ] **Step 1: Implement `src/components/StopwatchOverlay.tsx`**

```tsx
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDuration, isPersonalBest } from '@/lib/stopwatch'

interface Run { duration_ms: number; created_at?: string }

export default function StopwatchOverlay({
  memberId,
  colour,
  onClose,
}: {
  memberId: number
  colour: string
  onClose: () => void
}) {
  const [phase, setPhase] = useState<'idle' | 'running' | 'stopped'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [runs, setRuns] = useState<Run[]>([])
  const [bestMsState, setBestMsState] = useState<number | null>(null)
  const [newBest, setNewBest] = useState(false)
  const startedAt = useRef(0)
  const raf = useRef<number | null>(null)

  const loadRuns = useCallback(async () => {
    const res = await fetch(`/api/stopwatch?member_id=${memberId}`)
    if (res.ok) {
      const data = await res.json()
      setRuns(data.runs ?? [])
      setBestMsState(data.best_ms ?? null)
    }
  }, [memberId])

  useEffect(() => { loadRuns() }, [loadRuns])

  const tick = useCallback(() => {
    setElapsed(Date.now() - startedAt.current)
    raf.current = requestAnimationFrame(tick)
  }, [])

  const start = () => {
    setNewBest(false)
    startedAt.current = Date.now()
    setElapsed(0)
    setPhase('running')
    raf.current = requestAnimationFrame(tick)
  }

  const stop = async () => {
    if (raf.current) cancelAnimationFrame(raf.current)
    const final = Date.now() - startedAt.current
    setElapsed(final)
    setPhase('stopped')
    const wasBest = isPersonalBest(final, runs)
    await fetch('/api/stopwatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: memberId, duration_ms: final }),
    })
    if (wasBest) {
      setNewBest(true)
      const { default: confetti } = await import('canvas-confetti')
      confetti({ particleCount: 160, spread: 80, origin: { y: 0.6 } })
    }
    loadRuns()
  }

  const reset = () => {
    setElapsed(0)
    setNewBest(false)
    setPhase('idle')
  }

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current) }, [])

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-8"
      style={{ background: '#0b0b14' }}>
      <button onClick={onClose}
        className="absolute top-5 right-6 text-white/40 text-4xl leading-none" aria-label="Close">✕</button>

      <div className="font-bold tabular-nums" style={{
        fontFamily: 'var(--font-fredoka)',
        fontSize: 'min(28vw, 12rem)',
        color: phase === 'stopped' ? colour : '#ffffff',
        lineHeight: 1,
      }}>
        {formatDuration(elapsed)}
      </div>

      {newBest && (
        <div className="text-3xl font-black" style={{ color: colour }}>New best! 🎉</div>
      )}

      {phase !== 'stopped' ? (
        <button onClick={phase === 'idle' ? start : stop}
          className="px-16 py-6 rounded-3xl text-white font-black active:scale-95 transition-transform"
          style={{ background: phase === 'running' ? '#ef4444' : colour, fontFamily: 'var(--font-fredoka)', fontSize: '2.5rem' }}>
          {phase === 'idle' ? 'Start' : 'Stop'}
        </button>
      ) : (
        <button onClick={reset}
          className="px-16 py-6 rounded-3xl text-white font-black active:scale-95 transition-transform"
          style={{ background: colour, fontFamily: 'var(--font-fredoka)', fontSize: '2.5rem' }}>
          Go again
        </button>
      )}

      <div className="flex flex-col items-center gap-1 text-white/60">
        <div className="text-xl font-bold">
          Best: <span style={{ color: colour }}>{bestMsState !== null ? formatDuration(bestMsState) : '—'}</span>
        </div>
        {runs.length > 0 && (
          <div className="flex gap-3 text-sm">
            {runs.map((r, i) => <span key={i} className="tabular-nums">{formatDuration(r.duration_ms)}</span>)}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire into `src/app/page.tsx`**

Add import:
```tsx
import StopwatchOverlay from '@/components/StopwatchOverlay'
```

Add state near the other `useState`s in `HomePage`:
```tsx
  const [stopwatchOpen, setStopwatchOpen] = useState(false)
```

In the top bar, immediately before the settings gear `<button onClick={() => router.push('/admin')} …>`, add:
```tsx
        {activeMember?.stopwatch_enabled ? (
          <button onClick={() => setStopwatchOpen(true)}
            className="text-white/40 hover:text-white/80 transition-colors"
            style={{ fontSize: '1.5rem', padding: '0.4rem' }} aria-label="Stopwatch">
            ⏱
          </button>
        ) : null}
```

Before the final closing `</div>` of the returned root (with the other overlays), add:
```tsx
      {stopwatchOpen && activeMember && (
        <StopwatchOverlay memberId={activeMember.id} colour={accentColour} onClose={() => setStopwatchOpen(false)} />
      )}
```

- [ ] **Step 3:** `npm run lint` clean; `npm test` (all pass); `npm run build` succeeds. Commit.

```bash
git add src/components/StopwatchOverlay.tsx src/app/page.tsx
git commit -m "feat: add full-screen stopwatch overlay and top-bar launch button"
```

---

### Task 7: Verify + finish

- [ ] Preview: enable stopwatch for a member in admin; on their screen the ⏱ button appears; overlay Start/Stop shows time; a run saves; a faster run triggers confetti + "New best!"; Close exits; a member without the flag has no ⏱ button.
- [ ] `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Spec coverage pass, then PR/merge and deploy to the Pi (`git pull && npm run build && sudo reboot`).
