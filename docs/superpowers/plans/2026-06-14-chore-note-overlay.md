# Chore Note Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin attach an optional, day-scheduled note (text + colour) to a chore, which displays as a banner across the bottom of the chore's image only on the configured days.

**Architecture:** Three new columns on `chores` (`note_text`, `note_color`, `note_days_of_week`) follow the exact pattern established by `days_of_week`. A new pure helper `isNoteVisible` (alongside the existing `isDayEnabled`) determines whether the note shows today. `useChores` derives a `noteVisible` flag per chore; `ChoreCard` renders the banner when set. The admin `ChoresTab` gets a text input, colour-swatch picker, and a second day-picker (refactored into a shared `DayPickerRow` component).

**Tech Stack:** Next.js 14 (App Router), TypeScript, better-sqlite3, Jest + ts-jest, Tailwind CSS.

---

## Reference: design spec

Full requirements: `docs/superpowers/specs/2026-06-14-chore-note-overlay-design.md`

## Reference: current file states

These files will be modified. Their current full contents are shown so each task is self-contained.

**`src/lib/chores.ts`** (current, in full):
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

**`src/hooks/useChores.ts`** (current, in full):
```ts
'use client'
import useSWR from 'swr'
import { isDayEnabled } from '@/lib/chores'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

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

export interface Completion {
  id: number
  chore_id: number
  member_id: number
  date: string
}

export function useChores(
  memberId: number | null,
  routine: 'morning' | 'afternoon',
  date: string
) {
  const { data: allChores, mutate: mutateChores } = useSWR<Chore[]>(
    memberId ? `/api/chores?member_id=${memberId}` : '/api/chores',
    fetcher
  )
  const { data: completions, mutate: mutateCompletions } = useSWR<Completion[]>(
    memberId ? `/api/completions?date=${date}&member_id=${memberId}` : null,
    fetcher,
    { refreshInterval: 5000 }
  )

  const dow = new Date().getDay() // 0 = Sunday … 6 = Saturday, local time

  const chores = (allChores ?? []).filter(
    (c) =>
      memberId !== null &&
      c.member_ids.includes(memberId) &&
      (c.routine === routine || c.routine === 'both') &&
      isDayEnabled(c.days_of_week, dow)
  )

  const completedIds = new Set((completions ?? []).map((c) => c.chore_id))

  return { chores, completedIds, mutateChores, mutateCompletions }
}
```

---

## Task 1: DB migration — add note columns

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/lib/__tests__/db.test.ts`

**Context:** `initSchema` in `db.ts` uses try/catch `ALTER TABLE` migrations for idempotent column additions. The `days_of_week` migration (around line 89-94) is the most recent example. Add three more columns the same way, immediately after it.

- [ ] **Step 1: Write the failing test**

Add to the bottom of `src/lib/__tests__/db.test.ts`:

```ts
test('chores table has note columns with correct defaults', () => {
  const db = getDb()
  const info = db.prepare('PRAGMA table_info(chores)').all() as { name: string; dflt_value: string | null }[]
  const byName = (n: string) => info.find((c) => c.name === n)
  expect(byName('note_text')?.dflt_value).toBe("''")
  expect(byName('note_color')?.dflt_value).toBe("'yellow'")
  expect(byName('note_days_of_week')?.dflt_value).toBe('127')
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern=db.test
```

Expected: FAIL — `byName('note_text')` returns `undefined`.

- [ ] **Step 3: Add the migration to `src/lib/db.ts`**

Inside `initSchema`, immediately after the existing `days_of_week` migration block:

```ts
  // Day-of-week filter for chores (bitmask: bit 0=Sun … bit 6=Sat, 127=all days)
  try {
    db.exec(`ALTER TABLE chores ADD COLUMN days_of_week INTEGER NOT NULL DEFAULT 127`)
  } catch {
    // Column already exists — safe to ignore
  }
```

add:

```ts
  // Optional scheduled note overlay for chores (e.g. "Pack library books" on Fridays).
  // note_days_of_week uses the same bitmask convention as days_of_week.
  try {
    db.exec(`ALTER TABLE chores ADD COLUMN note_text TEXT NOT NULL DEFAULT ''`)
  } catch {
    // Column already exists — safe to ignore
  }
  try {
    db.exec(`ALTER TABLE chores ADD COLUMN note_color TEXT NOT NULL DEFAULT 'yellow'`)
  } catch {
    // Column already exists — safe to ignore
  }
  try {
    db.exec(`ALTER TABLE chores ADD COLUMN note_days_of_week INTEGER NOT NULL DEFAULT 127`)
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
git commit -m "feat: add note_text, note_color, note_days_of_week columns to chores"
```

---

## Task 2: NOTE_COLORS palette + isNoteVisible helper

**Files:**
- Modify: `src/lib/chores.ts`
- Modify: `src/lib/__tests__/chores.test.ts`

**Context:** `src/lib/chores.ts` currently exports only `isDayEnabled` (shown in full above). Add a `NOTE_COLORS` palette map and a pure `isNoteVisible` helper that combines an empty-text check with `isDayEnabled`. Both will be reused by `useChores`, `ChoreCard`, and `ChoresTab`.

- [ ] **Step 1: Write the failing tests**

The current `src/lib/__tests__/chores.test.ts` starts with:

```ts
import { isDayEnabled } from '../chores'
```

Change the import line to:

```ts
import { isDayEnabled, isNoteVisible, NOTE_COLORS } from '../chores'
```

Then append to the bottom of the file:

```ts
test('isNoteVisible is false when note text is empty or whitespace', () => {
  expect(isNoteVisible('', 127, 5)).toBe(false)
  expect(isNoteVisible('   ', 127, 5)).toBe(false)
})

test('isNoteVisible is true when text is set and today matches the mask', () => {
  const fridayOnly = 32 // bit 5
  expect(isNoteVisible('Pack library books', fridayOnly, 5)).toBe(true) // Friday
})

test('isNoteVisible is false when text is set but today does not match the mask', () => {
  const fridayOnly = 32 // bit 5
  expect(isNoteVisible('Pack library books', fridayOnly, 1)).toBe(false) // Monday
  expect(isNoteVisible('Pack library books', fridayOnly, 0)).toBe(false) // Sunday
})

test('isNoteVisible is true every day when mask is 127 and text is set', () => {
  for (let dow = 0; dow <= 6; dow++) {
    expect(isNoteVisible('Reminder', 127, dow)).toBe(true)
  }
})

test('NOTE_COLORS provides a hex value for each preset key', () => {
  expect(NOTE_COLORS.yellow).toBe('#facc15')
  expect(NOTE_COLORS.blue).toBe('#60a5fa')
  expect(NOTE_COLORS.pink).toBe('#f472b6')
  expect(NOTE_COLORS.green).toBe('#4ade80')
  expect(NOTE_COLORS.orange).toBe('#fb923c')
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern=chores.test
```

Expected: FAIL — `Cannot find module` style errors or `isNoteVisible is not a function` / `NOTE_COLORS is undefined`, since neither export exists yet.

- [ ] **Step 3: Add `NOTE_COLORS` and `isNoteVisible` to `src/lib/chores.ts`**

Append to `src/lib/chores.ts` (keep the existing `isDayEnabled` function as-is):

```ts

/**
 * Preset colours available for chore note overlays, keyed by name.
 * The key is what's stored in the chore's `note_color` column.
 */
export const NOTE_COLORS: Record<string, string> = {
  yellow: '#facc15',
  blue: '#60a5fa',
  pink: '#f472b6',
  green: '#4ade80',
  orange: '#fb923c',
}

/**
 * Returns true if a chore's note overlay should be shown today.
 *
 * @param noteText       - The note's text. An empty (or whitespace-only) string
 *                          means no note is configured, so the overlay never shows.
 * @param noteDaysOfWeek - Bitmask using the same convention as isDayEnabled.
 * @param dow            - Day of week from Date.getDay(): 0 = Sunday … 6 = Saturday.
 */
export function isNoteVisible(noteText: string, noteDaysOfWeek: number, dow: number): boolean {
  return noteText.trim() !== '' && isDayEnabled(noteDaysOfWeek, dow)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --testPathPattern=chores.test
```

Expected: all tests in `chores.test.ts` PASS (9 total: 4 existing + 5 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chores.ts src/lib/__tests__/chores.test.ts
git commit -m "feat: add isNoteVisible helper and NOTE_COLORS palette"
```

---

## Task 3: Chore interface, useChores derivation, API persistence

**Files:**
- Modify: `src/hooks/useChores.ts`
- Modify: `src/app/api/chores/route.ts`

**Context:** `useChores.ts`'s full current content is shown in the "Reference" section above. `route.ts`'s `ChoreRow` interface, `POST`, and `PUT` need the same three fields added, following exactly the pattern used for `days_of_week`.

- [ ] **Step 1: Update `Chore` interface and import in `src/hooks/useChores.ts`**

Replace:

```ts
'use client'
import useSWR from 'swr'
import { isDayEnabled } from '@/lib/chores'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

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

with:

```ts
'use client'
import useSWR from 'swr'
import { isDayEnabled, isNoteVisible } from '@/lib/chores'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export interface Chore {
  id: number
  name: string
  image_path: string | null
  image_status: 'pending' | 'ready' | 'failed'
  points: number
  routine: 'morning' | 'afternoon' | 'both'
  member_ids: number[]
  days_of_week: number
  note_text: string
  note_color: string
  note_days_of_week: number
  noteVisible: boolean
}
```

- [ ] **Step 2: Update the `useChores` function body**

Replace:

```ts
export function useChores(
  memberId: number | null,
  routine: 'morning' | 'afternoon',
  date: string
) {
  const { data: allChores, mutate: mutateChores } = useSWR<Chore[]>(
    memberId ? `/api/chores?member_id=${memberId}` : '/api/chores',
    fetcher
  )
  const { data: completions, mutate: mutateCompletions } = useSWR<Completion[]>(
    memberId ? `/api/completions?date=${date}&member_id=${memberId}` : null,
    fetcher,
    { refreshInterval: 5000 }
  )

  const dow = new Date().getDay() // 0 = Sunday … 6 = Saturday, local time

  const chores = (allChores ?? []).filter(
    (c) =>
      memberId !== null &&
      c.member_ids.includes(memberId) &&
      (c.routine === routine || c.routine === 'both') &&
      isDayEnabled(c.days_of_week, dow)
  )

  const completedIds = new Set((completions ?? []).map((c) => c.chore_id))

  return { chores, completedIds, mutateChores, mutateCompletions }
}
```

with:

```ts
export function useChores(
  memberId: number | null,
  routine: 'morning' | 'afternoon',
  date: string
) {
  const { data: allChores, mutate: mutateChores } = useSWR<Omit<Chore, 'noteVisible'>[]>(
    memberId ? `/api/chores?member_id=${memberId}` : '/api/chores',
    fetcher
  )
  const { data: completions, mutate: mutateCompletions } = useSWR<Completion[]>(
    memberId ? `/api/completions?date=${date}&member_id=${memberId}` : null,
    fetcher,
    { refreshInterval: 5000 }
  )

  const dow = new Date().getDay() // 0 = Sunday … 6 = Saturday, local time

  const chores: Chore[] = (allChores ?? [])
    .filter(
      (c) =>
        memberId !== null &&
        c.member_ids.includes(memberId) &&
        (c.routine === routine || c.routine === 'both') &&
        isDayEnabled(c.days_of_week, dow)
    )
    .map((c) => ({
      ...c,
      noteVisible: isNoteVisible(c.note_text, c.note_days_of_week, dow),
    }))

  const completedIds = new Set((completions ?? []).map((c) => c.chore_id))

  return { chores, completedIds, mutateChores, mutateCompletions }
}
```

- [ ] **Step 3: Update `ChoreRow` interface in `src/app/api/chores/route.ts`**

Replace:

```ts
interface ChoreRow {
  id: number
  name: string
  image_path: string | null
  image_status: string
  points: number
  routine: string
  days_of_week: number
  created_at: string
}
```

with:

```ts
interface ChoreRow {
  id: number
  name: string
  image_path: string | null
  image_status: string
  points: number
  routine: string
  days_of_week: number
  note_text: string
  note_color: string
  note_days_of_week: number
  created_at: string
}
```

- [ ] **Step 4: Update `POST` in `src/app/api/chores/route.ts`**

Replace:

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

with:

```ts
export async function POST(req: NextRequest) {
  const { name, points, routine, member_ids, days_of_week, note_text, note_color, note_days_of_week } = await req.json()
  const db = getDb()
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO chores (name, points, routine, image_status, days_of_week, note_text, note_color, note_days_of_week)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      name,
      points ?? 1,
      routine ?? 'morning',
      'pending',
      days_of_week ?? 127,
      note_text ?? '',
      note_color ?? 'yellow',
      note_days_of_week ?? 127
    )

  const choreId = lastInsertRowid as number
  const ins = db.prepare('INSERT INTO chore_assignments (chore_id, member_id) VALUES (?, ?)')
  for (const mid of member_ids ?? []) ins.run(choreId, mid)

  return NextResponse.json({ id: choreId, name }, { status: 201 })
}
```

- [ ] **Step 5: Update `PUT` in `src/app/api/chores/route.ts`**

Replace:

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

with:

```ts
export async function PUT(req: NextRequest) {
  const { id, name, points, routine, member_ids, image_status, image_path, days_of_week, note_text, note_color, note_days_of_week } = await req.json()
  const db = getDb()
  db.prepare(
    `UPDATE chores SET name=?, points=?, routine=?,
      image_status=COALESCE(?, image_status),
      image_path=COALESCE(?, image_path),
      days_of_week=COALESCE(?, days_of_week),
      note_text=COALESCE(?, note_text),
      note_color=COALESCE(?, note_color),
      note_days_of_week=COALESCE(?, note_days_of_week)
    WHERE id=?`
  ).run(
    name,
    points,
    routine,
    image_status ?? null,
    image_path ?? null,
    days_of_week ?? null,
    note_text ?? null,
    note_color ?? null,
    note_days_of_week ?? null,
    id
  )

  if (member_ids !== undefined) {
    db.prepare('DELETE FROM chore_assignments WHERE chore_id=?').run(id)
    const ins = db.prepare('INSERT INTO chore_assignments (chore_id, member_id) VALUES (?, ?)')
    for (const mid of member_ids) ins.run(id, mid)
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: all tests PASS (the new Task 1 and Task 2 tests, plus all existing tests).

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useChores.ts src/app/api/chores/route.ts
git commit -m "feat: derive noteVisible in useChores; persist note fields via API"
```

---

## Task 4: ChoreCard and ChoreGrid — render the note banner

**Files:**
- Modify: `src/components/ChoreCard.tsx`
- Modify: `src/components/ChoreGrid.tsx`

**Context:** `ChoreCard.tsx`'s image area (the first child `div` inside the button, currently with class `w-full overflow-hidden flex items-center justify-center bg-white`) needs `relative` positioning added so the note banner can be anchored to its bottom edge with `absolute bottom-0 left-0 right-0`. `ChoreGrid.tsx` passes per-chore props straight from `Chore` to `ChoreCard`.

- [ ] **Step 1: Update `src/components/ChoreCard.tsx`**

Current full content:

```tsx
'use client'

interface Props {
  id: number
  name: string
  imagePath: string | null
  imageStatus: 'pending' | 'ready' | 'failed'
  completed: boolean
  accentColour: string
  isPending?: boolean
  onToggle: (id: number) => void
}

export default function ChoreCard({
  id,
  name,
  imagePath,
  imageStatus,
  completed,
  accentColour,
  isPending,
  onToggle,
}: Props) {
  return (
    <button
      onClick={() => onToggle(id)}
      className="relative rounded-2xl overflow-hidden transition-all duration-200 active:scale-95 w-full h-full"
      style={{
        background: 'rgba(255,255,255,0.07)',
        border: `3px solid ${completed ? accentColour : 'rgba(255,255,255,0.1)'}`,
        display: 'grid',
        gridTemplateRows: '1fr auto',
        boxShadow: completed ? `0 0 20px ${accentColour}88` : undefined,
      }}
    >
      {/* Image area */}
      <div className="w-full overflow-hidden flex items-center justify-center bg-white" style={{ minHeight: 0 }}>
        {imageStatus === 'ready' && imagePath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagePath} alt={name} className="w-full h-full object-contain" style={{ opacity: completed ? 0.35 : 1 }} />
        ) : (
          <span
            className="text-4xl"
            style={{ animation: imageStatus === 'pending' ? 'pulse 2s infinite' : undefined }}
          >
            {imageStatus === 'failed' ? '⚠️' : '⏳'}
          </span>
        )}
      </div>

      {/* Label */}
      <div
        className="text-center font-extrabold leading-snug"
        style={{
          fontSize: 'clamp(1rem, 2.2vw, 2rem)',
          padding: 'clamp(0.5rem, 1.2vw, 1.25rem) clamp(0.4rem, 1vw, 1rem)',
          background: completed ? accentColour : 'rgba(0,0,0,0.6)',
          color: '#fff',
          letterSpacing: '0.01em',
        }}
      >
        {name}
      </div>

      {/* Completed overlay — big centred tick */}
      {completed && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ paddingBottom: '15%' }}>
          <span style={{ fontSize: 'min(30vw, 30vh, 8rem)', lineHeight: 1, filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.4))' }}>
            ✅
          </span>
        </div>
      )}

      {/* Pending overlay */}
      {isPending && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
        >
          <span className="text-5xl drop-shadow-lg">⏳</span>
        </div>
      )}
    </button>
  )
}
```

Replace it with:

```tsx
'use client'
import { NOTE_COLORS } from '@/lib/chores'

interface Props {
  id: number
  name: string
  imagePath: string | null
  imageStatus: 'pending' | 'ready' | 'failed'
  completed: boolean
  accentColour: string
  isPending?: boolean
  noteText?: string
  noteColor?: string
  noteVisible?: boolean
  onToggle: (id: number) => void
}

export default function ChoreCard({
  id,
  name,
  imagePath,
  imageStatus,
  completed,
  accentColour,
  isPending,
  noteText,
  noteColor,
  noteVisible,
  onToggle,
}: Props) {
  return (
    <button
      onClick={() => onToggle(id)}
      className="relative rounded-2xl overflow-hidden transition-all duration-200 active:scale-95 w-full h-full"
      style={{
        background: 'rgba(255,255,255,0.07)',
        border: `3px solid ${completed ? accentColour : 'rgba(255,255,255,0.1)'}`,
        display: 'grid',
        gridTemplateRows: '1fr auto',
        boxShadow: completed ? `0 0 20px ${accentColour}88` : undefined,
      }}
    >
      {/* Image area */}
      <div className="w-full overflow-hidden flex items-center justify-center bg-white relative" style={{ minHeight: 0 }}>
        {imageStatus === 'ready' && imagePath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagePath} alt={name} className="w-full h-full object-contain" style={{ opacity: completed ? 0.35 : 1 }} />
        ) : (
          <span
            className="text-4xl"
            style={{ animation: imageStatus === 'pending' ? 'pulse 2s infinite' : undefined }}
          >
            {imageStatus === 'failed' ? '⚠️' : '⏳'}
          </span>
        )}

        {/* Scheduled note banner */}
        {noteVisible && noteText && (
          <div
            className="absolute bottom-0 left-0 right-0 text-center font-bold"
            style={{
              background: NOTE_COLORS[noteColor ?? 'yellow'] ?? NOTE_COLORS.yellow,
              color: '#1a1a2e',
              padding: '0.3rem 0.5rem',
              fontSize: 'clamp(0.75rem, 1.6vw, 1.25rem)',
            }}
          >
            {noteText}
          </div>
        )}
      </div>

      {/* Label */}
      <div
        className="text-center font-extrabold leading-snug"
        style={{
          fontSize: 'clamp(1rem, 2.2vw, 2rem)',
          padding: 'clamp(0.5rem, 1.2vw, 1.25rem) clamp(0.4rem, 1vw, 1rem)',
          background: completed ? accentColour : 'rgba(0,0,0,0.6)',
          color: '#fff',
          letterSpacing: '0.01em',
        }}
      >
        {name}
      </div>

      {/* Completed overlay — big centred tick */}
      {completed && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ paddingBottom: '15%' }}>
          <span style={{ fontSize: 'min(30vw, 30vh, 8rem)', lineHeight: 1, filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.4))' }}>
            ✅
          </span>
        </div>
      )}

      {/* Pending overlay */}
      {isPending && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
        >
          <span className="text-5xl drop-shadow-lg">⏳</span>
        </div>
      )}
    </button>
  )
}
```

- [ ] **Step 2: Update `src/components/ChoreGrid.tsx`**

In the `chores.map(...)` block, find:

```tsx
      {chores.map((chore) => (
        <ChoreCard
          key={chore.id}
          id={chore.id}
          name={chore.name}
          imagePath={chore.image_path}
          imageStatus={chore.image_status}
          completed={completedIds.has(chore.id)}
          accentColour={accentColour}
          isPending={pendingIds?.has(chore.id)}
          onToggle={onToggle}
        />
      ))}
```

Replace with:

```tsx
      {chores.map((chore) => (
        <ChoreCard
          key={chore.id}
          id={chore.id}
          name={chore.name}
          imagePath={chore.image_path}
          imageStatus={chore.image_status}
          completed={completedIds.has(chore.id)}
          accentColour={accentColour}
          isPending={pendingIds?.has(chore.id)}
          noteText={chore.note_text}
          noteColor={chore.note_color}
          noteVisible={chore.noteVisible}
          onToggle={onToggle}
        />
      ))}
```

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all tests PASS (this task adds no new tests — `ChoreCard`/`ChoreGrid` have no existing test files, and the project has no React component test setup).

- [ ] **Step 4: Manual smoke test**

1. Run `npm run dev`
2. In the database (or via a quick manual API call), set a chore's `note_text` to `"Pack library books"`, `note_color` to `"yellow"`, and `note_days_of_week` to `32` (Friday only) — this will be easier once Task 5 lands, so it's fine to defer a full visual check until after Task 5. For now, just confirm `npm run dev` builds with no TypeScript errors from this task's changes.

- [ ] **Step 5: Commit**

```bash
git add src/components/ChoreCard.tsx src/components/ChoreGrid.tsx
git commit -m "feat: render scheduled note banner on chore cards"
```

---

## Task 5: Admin UI — note editor in ChoresTab

**Files:**
- Modify: `src/components/admin/ChoresTab.tsx`

**Context:** Full current content of `src/components/admin/ChoresTab.tsx` is 218 lines (shown in pieces below — every piece referenced here is from the current file). This task:
1. Generalizes `toggleDay` into `toggleDayField` so it can toggle either `days_of_week` or `note_days_of_week`.
2. Extracts the day-picker button row into a shared `DayPickerRow` component (used for both "Days" and the new "Note shows on").
3. Adds `note_text`, `note_color`, `note_days_of_week` to `ChoreForm` and both `setEditing` call sites.
4. Adds a "Note" section to the edit modal (text input + colour swatches + day picker).
5. Adds a note indicator to the chore list row.

- [ ] **Step 1: Update imports, `DAY_LABELS`, and add `DayPickerRow`**

Find:

```ts
'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { useMembers } from '@/hooks/useMembers'
import type { Chore } from '@/hooks/useChores'
import { isDayEnabled } from '@/lib/chores'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const

type ChoreForm = {
  id?: number
  name: string
  points: number
  routine: 'morning' | 'afternoon' | 'both'
  member_ids: number[]
  days_of_week: number
}
```

Replace with:

```ts
'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { useMembers } from '@/hooks/useMembers'
import type { Chore } from '@/hooks/useChores'
import { isDayEnabled, NOTE_COLORS } from '@/lib/chores'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const

type ChoreForm = {
  id?: number
  name: string
  points: number
  routine: 'morning' | 'afternoon' | 'both'
  member_ids: number[]
  days_of_week: number
  note_text: string
  note_color: string
  note_days_of_week: number
}

function DayPickerRow({ value, onToggle }: { value: number; onToggle: (dow: number) => void }) {
  return (
    <div className="flex gap-1">
      {DAY_LABELS.map((label, dow) => {
        const active = isDayEnabled(value, dow)
        return (
          <button
            key={dow}
            type="button"
            onClick={() => onToggle(dow)}
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
  )
}
```

- [ ] **Step 2: Generalize `toggleDay` into `toggleDayField`**

Find:

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

Replace with:

```ts
  const toggleDayField = (field: 'days_of_week' | 'note_days_of_week', dow: number) =>
    setEditing((prev) => {
      if (!prev) return prev
      const bit = 1 << dow
      const current = prev[field]
      const isOn = (current & bit) !== 0
      // Prevent deselecting the last active day for the chore's own visibility schedule.
      // The note schedule has no such guard — 0 is a valid "note never shows" state.
      if (field === 'days_of_week' && isOn && current === bit) return prev
      return { ...prev, [field]: isOn ? current & ~bit : current | bit }
    })
```

- [ ] **Step 3: Update the "+ Add Chore" button's `setEditing` call**

Find:

```tsx
        <button
          onClick={() => setEditing({ name: '', points: 1, routine: 'morning', member_ids: [], days_of_week: 127 })}
          className="px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: '#6366f1' }}>
          + Add Chore
        </button>
```

Replace with:

```tsx
        <button
          onClick={() => setEditing({ name: '', points: 1, routine: 'morning', member_ids: [], days_of_week: 127, note_text: '', note_color: 'yellow', note_days_of_week: 127 })}
          className="px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: '#6366f1' }}>
          + Add Chore
        </button>
```

- [ ] **Step 4: Update the chore list row — info line and Edit button**

Find:

```tsx
          <div className="flex-1">
            <div className="font-bold text-white text-sm">{c.name}</div>
            <div className="text-xs text-white/50">
              {c.routine} · {c.points}pt
              {c.days_of_week !== 127 && (
                <> · {DAY_LABELS.filter((_, i) => isDayEnabled(c.days_of_week, i)).join(' ')}</>
              )}
            </div>
          </div>
```

Replace with:

```tsx
          <div className="flex-1">
            <div className="font-bold text-white text-sm">{c.name}</div>
            <div className="text-xs text-white/50">
              {c.routine} · {c.points}pt
              {c.days_of_week !== 127 && (
                <> · {DAY_LABELS.filter((_, i) => isDayEnabled(c.days_of_week, i)).join(' ')}</>
              )}
              {c.note_text && (
                <> · <span style={{ color: NOTE_COLORS[c.note_color] ?? NOTE_COLORS.yellow }}>●</span> {c.note_text}</>
              )}
            </div>
          </div>
```

Then find the Edit button:

```tsx
          <button onClick={() => setEditing({ id: c.id, name: c.name, points: c.points, routine: c.routine, member_ids: c.member_ids, days_of_week: c.days_of_week ?? 127 })}
            className="px-3 py-1 rounded-lg text-xs font-bold text-white/60"
            style={{ background: 'rgba(255,255,255,0.08)' }}>Edit</button>
```

Replace with:

```tsx
          <button onClick={() => setEditing({ id: c.id, name: c.name, points: c.points, routine: c.routine, member_ids: c.member_ids, days_of_week: c.days_of_week ?? 127, note_text: c.note_text ?? '', note_color: c.note_color ?? 'yellow', note_days_of_week: c.note_days_of_week ?? 127 })}
            className="px-3 py-1 rounded-lg text-xs font-bold text-white/60"
            style={{ background: 'rgba(255,255,255,0.08)' }}>Edit</button>
```

- [ ] **Step 5: Replace the "Days" picker block and add the "Note" section**

Find:

```tsx
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Days</label>
              <div className="flex gap-1">
                {DAY_LABELS.map((label, dow) => {
                  const active = isDayEnabled(editing.days_of_week, dow)
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

Replace with:

```tsx
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Days</label>
              <DayPickerRow value={editing.days_of_week} onToggle={(dow) => toggleDayField('days_of_week', dow)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Note</label>
              <input type="text" placeholder="Optional note, e.g. Pack library books" value={editing.note_text}
                onChange={(e) => setEditing((p) => p && ({ ...p, note_text: e.target.value }))}
                className="px-3 py-2 rounded-xl bg-white/10 text-white outline-none border border-white/10" />
              <div className="flex gap-2 mt-1">
                {Object.entries(NOTE_COLORS).map(([key, hex]) => (
                  <button key={key} type="button" onClick={() => setEditing((p) => p && ({ ...p, note_color: key }))}
                    aria-label={key}
                    className="w-8 h-8 rounded-full"
                    style={{
                      background: hex,
                      border: editing.note_color === key ? '3px solid white' : '3px solid transparent',
                    }} />
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Note shows on</label>
              <DayPickerRow value={editing.note_days_of_week} onToggle={(dow) => toggleDayField('note_days_of_week', dow)} />
            </div>
```

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: all tests PASS (this task adds no new automated tests — `ChoresTab` has no existing test file, consistent with the rest of the admin UI).

- [ ] **Step 7: Manual smoke test**

1. Run `npm run dev`
2. Go to `/admin` → Chores tab
3. Edit (or create) a chore, e.g. Tyler's "Pack bag"
4. In the "Note" field, type `Pack library books`
5. Click the **yellow** swatch (should show a white ring when selected; clicking other swatches moves the ring)
6. In "Note shows on", click every day except **Fr** to deselect them, leaving only Friday active — verify there's no "last day" guard preventing this (you should be able to deselect all the way down to zero or one day freely)
7. Save
8. The chore list row should now show: `morning · 1pt · 🟡 Pack library books` (no day suffix on the note row itself — that's a UI nuance only in the list summary, the note text itself is shown)
9. Reload the main grid (`/`) as Tyler. On a Friday, the "Pack bag" tile should show a yellow banner reading "Pack library books" across the bottom of its image. On any other day, the tile should look normal with no banner.
   - To test both branches without waiting for an actual Friday, temporarily set `note_days_of_week` to `127` (shows every day) via the admin UI, confirm the banner appears, then restrict back to Friday-only (`32`) and confirm it disappears on non-Friday days.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/ChoresTab.tsx
git commit -m "feat: add note text, colour, and day-picker to chore admin UI"
```

---

## Final Verification

- [ ] Run `npm test` — all suites pass.
- [ ] Run `npm run build` — confirms no TypeScript errors across all modified files.
