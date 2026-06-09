# Chore Day-of-Week Filtering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `days_of_week` bitmask to chores so each chore only appears in the grid on its configured days.

**Architecture:** A single `ALTER TABLE` migration adds `days_of_week INTEGER NOT NULL DEFAULT 127` (all 7 bits = every day). A pure helper `isDayEnabled(daysOfWeek, dow)` does the bit test. `useChores` applies it at filter time. The admin UI adds a 7-button day picker to the chore edit modal.

**Tech Stack:** Next.js 14 App Router, TypeScript, better-sqlite3, SWR, Tailwind CSS, Jest (via `npm test`)

---

## File Map

| File | Change |
|---|---|
| `src/lib/db.ts` | Add idempotent migration: `ALTER TABLE chores ADD COLUMN days_of_week INTEGER NOT NULL DEFAULT 127` |
| `src/lib/chores.ts` | **New** — exports pure helper `isDayEnabled(daysOfWeek: number, dow: number): boolean` |
| `src/lib/__tests__/chores.test.ts` | **New** — unit tests for `isDayEnabled` |
| `src/lib/__tests__/db.test.ts` | Add test: `chores` table has `days_of_week` column with default `127` |
| `src/hooks/useChores.ts` | Add `days_of_week: number` to `Chore` interface; apply `isDayEnabled` filter |
| `src/app/api/chores/route.ts` | Accept `days_of_week` in POST body; include in PUT UPDATE statement |
| `src/components/admin/ChoresTab.tsx` | Add `days_of_week` to `ChoreForm`; day-picker in modal; day summary in list row |

---

### Task 1: DB migration

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/lib/__tests__/db.test.ts`

**Context:** `initSchema` in `db.ts` already uses try/catch `ALTER TABLE` migrations for idempotent column additions (see the `appearance` column migration around line 84). Follow the same pattern. Tests use `PRAGMA table_info(table_name)` to check columns — see existing tests for `appearance` and `streak_days` as examples.

- [ ] **Step 1: Write the failing test**

Add to the bottom of `src/lib/__tests__/db.test.ts`:

```ts
test('chores table has days_of_week column with default 127', () => {
  const db = getDb()
  const info = db.prepare('PRAGMA table_info(chores)').all() as { name: string; dflt_value: string | null }[]
  const col = info.find((c) => c.name === 'days_of_week')
  expect(col).toBeDefined()
  expect(col?.dflt_value).toBe('127')
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern=db.test
```

Expected: FAIL — `col` is `undefined`.

- [ ] **Step 3: Add the migration to `src/lib/db.ts`**

Inside `initSchema`, after the existing `appearance` migration try/catch block (around line 87), add:

```ts
// Day-of-week filter for chores (bitmask: bit 0=Sun … bit 6=Sat, 127=all days)
try {
  db.exec(`ALTER TABLE chores ADD COLUMN days_of_week INTEGER NOT NULL DEFAULT 127`)
} catch {
  // Column already exists — safe to ignore
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern=db.test
```

Expected: all db tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/lib/__tests__/db.test.ts
git commit -m "feat: add days_of_week column to chores (bitmask, default 127)"
```

---

### Task 2: Pure filter helper + unit tests

**Files:**
- Create: `src/lib/chores.ts`
- Create: `src/lib/__tests__/chores.test.ts`

**Context:** The filter `((daysOfWeek >> dow) & 1) === 1` checks whether bit `dow` is set in the bitmask. `Date.getDay()` returns 0=Sunday, 1=Monday … 6=Saturday — matching bit indices. Extracting this as a named function makes it independently testable without mocking SWR or React.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/chores.test.ts`:

```ts
import { isDayEnabled } from '../chores'

test('isDayEnabled returns true for all days when mask is 127', () => {
  for (let dow = 0; dow <= 6; dow++) {
    expect(isDayEnabled(127, dow)).toBe(true)
  }
})

test('isDayEnabled Friday-only mask (32 = 0b0100000) enables only Friday', () => {
  const fridayOnly = 32 // bit 5
  expect(isDayEnabled(fridayOnly, 5)).toBe(true)  // Friday
  expect(isDayEnabled(fridayOnly, 0)).toBe(false) // Sunday
  expect(isDayEnabled(fridayOnly, 1)).toBe(false) // Monday
  expect(isDayEnabled(fridayOnly, 4)).toBe(false) // Thursday
  expect(isDayEnabled(fridayOnly, 6)).toBe(false) // Saturday
})

test('isDayEnabled weekdays-only mask (62 = 0b0111110) excludes weekends', () => {
  const weekdays = 62 // Mon=1 Tue=2 Wed=3 Thu=4 Fri=5 → bits 1-5
  expect(isDayEnabled(weekdays, 0)).toBe(false) // Sunday
  expect(isDayEnabled(weekdays, 1)).toBe(true)  // Monday
  expect(isDayEnabled(weekdays, 2)).toBe(true)  // Tuesday
  expect(isDayEnabled(weekdays, 3)).toBe(true)  // Wednesday
  expect(isDayEnabled(weekdays, 4)).toBe(true)  // Thursday
  expect(isDayEnabled(weekdays, 5)).toBe(true)  // Friday
  expect(isDayEnabled(weekdays, 6)).toBe(false) // Saturday
})

test('isDayEnabled weekend-only mask (65 = 0b1000001) enables Sat and Sun only', () => {
  const weekends = 65 // bit 0 (Sun) + bit 6 (Sat)
  expect(isDayEnabled(weekends, 0)).toBe(true)  // Sunday
  expect(isDayEnabled(weekends, 1)).toBe(false) // Monday
  expect(isDayEnabled(weekends, 5)).toBe(false) // Friday
  expect(isDayEnabled(weekends, 6)).toBe(true)  // Saturday
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern=chores.test
```

Expected: FAIL — `Cannot find module '../chores'`.

- [ ] **Step 3: Create `src/lib/chores.ts`**

```ts
/**
 * Returns true if a chore should appear on the given day of the week.
 *
 * @param daysOfWeek - Bitmask: bit 0 = Sunday, bit 1 = Monday, …, bit 6 = Saturday.
 *                     127 (0b1111111) means every day.
 * @param dow        - Day of week from Date.getDay(): 0 = Sunday … 6 = Saturday.
 */
export function isDayEnabled(daysOfWeek: number, dow: number): boolean {
  return ((daysOfWeek >> dow) & 1) === 1
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --testPathPattern=chores.test
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chores.ts src/lib/__tests__/chores.test.ts
git commit -m "feat: add isDayEnabled helper for chore day-of-week bitmask"
```

---

### Task 3: Chore interface, API, and useChores filter

**Files:**
- Modify: `src/hooks/useChores.ts`
- Modify: `src/app/api/chores/route.ts`

**Context:**

`useChores.ts` currently filters chores by `memberId` and `routine`. The `Chore` interface needs `days_of_week: number`. The filter gets one extra clause using `isDayEnabled` from Task 2.

`route.ts` POST inserts into `chores` — add `days_of_week` to the INSERT. PUT updates chores — include `days_of_week` in the UPDATE. GET uses `SELECT *` which already returns `days_of_week` after the Task 1 migration, so no GET changes needed.

- [ ] **Step 1: Update `Chore` interface in `src/hooks/useChores.ts`**

Replace the existing `Chore` interface (lines 6–14):

```ts
export interface Chore {
  id: number
  name: string
  image_path: string | null
  image_status: 'pending' | 'ready' | 'failed'
  points: number
  routine: 'morning' | 'afternoon' | 'both'
  member_ids: number[]
  days_of_week: number
}
```

- [ ] **Step 2: Add the day-of-week filter to `useChores`**

Replace the `import useSWR from 'swr'` line at the top of `src/hooks/useChores.ts` with:

```ts
'use client'
import useSWR from 'swr'
import { isDayEnabled } from '@/lib/chores'
```

Then replace the `chores` filter block (currently lines 38–43):

```ts
const dow = new Date().getDay() // 0 = Sunday … 6 = Saturday, local time

const chores = (allChores ?? []).filter(
  (c) =>
    memberId !== null &&
    c.member_ids.includes(memberId) &&
    (c.routine === routine || c.routine === 'both') &&
    isDayEnabled(c.days_of_week, dow)
)
```

- [ ] **Step 3: Update POST in `src/app/api/chores/route.ts`**

Replace the existing `POST` handler (lines 96–108):

```ts
export async function POST(req: NextRequest) {
  const { name, points, routine, member_ids, days_of_week } = await req.json()
  const db = getDb()
  const { lastInsertRowid } = db
    .prepare('INSERT INTO chores (name, points, routine, image_status, days_of_week) VALUES (?, ?, ?, ?, ?)')
    .run(name, points ?? 1, routine ?? 'morning', 'pending', days_of_week ?? 127)

  const choreId = lastInsertRowid as number
  const ins = db.prepare('INSERT INTO chore_assignments (chore_id, member_id) VALUES (?, ?)')
  for (const mid of member_ids ?? []) ins.run(choreId, mid)

  return NextResponse.json({ id: choreId, name }, { status: 201 })
}
```

- [ ] **Step 4: Update PUT in `src/app/api/chores/route.ts`**

Replace the existing `PUT` handler (lines 110–126):

```ts
export async function PUT(req: NextRequest) {
  const { id, name, points, routine, member_ids, image_status, image_path, days_of_week } = await req.json()
  const db = getDb()
  db.prepare(
    `UPDATE chores SET name=?, points=?, routine=?,
      image_status=COALESCE(?, image_status),
      image_path=COALESCE(?, image_path),
      days_of_week=COALESCE(?, days_of_week)
    WHERE id=?`
  ).run(name, points, routine, image_status ?? null, image_path ?? null, days_of_week ?? null, id)

  if (member_ids !== undefined) {
    db.prepare('DELETE FROM chore_assignments WHERE chore_id=?').run(id)
    const ins = db.prepare('INSERT INTO chore_assignments (chore_id, member_id) VALUES (?, ?)')
    for (const mid of member_ids) ins.run(id, mid)
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all tests PASS (the new `isDayEnabled` and DB tests from Tasks 1–2, plus existing tests).

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useChores.ts src/app/api/chores/route.ts
git commit -m "feat: apply days_of_week filter in useChores; persist via API"
```

---

### Task 4: Admin UI — day picker and day summary

**Files:**
- Modify: `src/components/admin/ChoresTab.tsx`

**Context:** `ChoresTab.tsx` has:
- A `ChoreForm` type (top of file) — add `days_of_week: number`
- A list of chore rows — add a day summary when days are restricted
- An edit modal — add a row of 7 day-toggle buttons below the routine selector
- Two `setEditing(...)` calls — one for new chores, one for editing existing; both need `days_of_week`
- A `save()` function that `JSON.stringify(editing)` — no change needed, `days_of_week` is included automatically

The day order matches `Date.getDay()`: index 0 = Sunday, 1 = Monday … 6 = Saturday.

- [ ] **Step 1: Add `DAY_LABELS` constant and update `ChoreForm` type**

At the top of `ChoresTab.tsx`, after the imports, add:

```ts
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const
```

Replace the existing `ChoreForm` type:

```ts
type ChoreForm = {
  id?: number
  name: string
  points: number
  routine: 'morning' | 'afternoon' | 'both'
  member_ids: number[]
  days_of_week: number
}
```

- [ ] **Step 2: Add `toggleDay` helper inside the component**

Inside `ChoresTab`, after the existing `toggleMember` function, add:

```ts
const toggleDay = (dow: number) =>
  setEditing((prev) => {
    if (!prev) return prev
    const bit = 1 << dow
    const isOn = (prev.days_of_week & bit) !== 0
    // Prevent deselecting the last active day
    if (isOn && prev.days_of_week === bit) return prev
    return { ...prev, days_of_week: isOn ? prev.days_of_week & ~bit : prev.days_of_week | bit }
  })
```

- [ ] **Step 3: Update both `setEditing` calls to include `days_of_week`**

New chore button's `onClick` (currently `setEditing({ name: '', points: 1, routine: 'morning', member_ids: [] })`):

```ts
onClick={() => setEditing({ name: '', points: 1, routine: 'morning', member_ids: [], days_of_week: 127 })}
```

Edit button's `onClick` (currently sets `{ id, name, points, routine, member_ids }`):

```ts
onClick={() => setEditing({ id: c.id, name: c.name, points: c.points, routine: c.routine, member_ids: c.member_ids, days_of_week: c.days_of_week ?? 127 })}
```

- [ ] **Step 4: Add day summary to the chore list row**

Find the line in the chore list rendering:
```tsx
<div className="text-xs text-white/50">{c.routine} · {c.points}pt</div>
```

Replace it with:

```tsx
<div className="text-xs text-white/50">
  {c.routine} · {c.points}pt
  {c.days_of_week !== 127 && (
    <> · {DAY_LABELS.filter((_, i) => ((c.days_of_week >> i) & 1) === 1).join(' ')}</>
  )}
</div>
```

- [ ] **Step 5: Add the day-picker to the edit modal**

In the edit modal, find the closing `</div>` of the routine-picker block:
```tsx
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Points</label>
```

Insert the day-picker block between them:

```tsx
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Days</label>
              <div className="flex gap-1">
                {DAY_LABELS.map((label, dow) => {
                  const active = ((editing.days_of_week >> dow) & 1) === 1
                  return (
                    <button
                      key={dow}
                      type="button"
                      onClick={() => toggleDay(dow)}
                      className="flex-1 py-2 rounded-xl text-xs font-bold"
                      style={{
                        background: active ? '#6366f1' : 'rgba(255,255,255,0.08)',
                        color: active ? 'white' : 'rgba(255,255,255,0.3)',
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
```

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 7: Manual smoke test**

1. Run `npm run dev`
2. Go to `/admin` → Chores tab
3. Click **+ Add Chore** — verify all 7 day buttons appear, all lit (indigo)
4. Click **Fr** to deselect it — it should go grey; other days stay lit
5. Click the last remaining lit day — it should NOT deselect (at-least-one guard)
6. Save the chore
7. The chore list row should show e.g. `morning · 1pt · Su Mo Tu We Th Sa`
8. Click Edit on that chore — verify the day picker reflects the saved state (Fr is grey)
9. On a Friday, the chore should NOT appear in the main grid; on any other day it should appear
10. Edit the chore and re-enable all 7 days — the list row should no longer show the day summary

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/ChoresTab.tsx
git commit -m "feat: add day-of-week picker to chore admin UI"
```
