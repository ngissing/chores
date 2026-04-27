# Family Chore App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a family chore tracker for a Raspberry Pi kitchen touchscreen — per-member colour theming, AI-generated chore images, Barefoot Investor cash-in, and an admin panel.

**Architecture:** Next.js 14 App Router on a Raspberry Pi 4, SQLite via `better-sqlite3` for local zero-config storage, `node-cron` scheduler started via `instrumentation.ts` for daily resets and routine auto-switch.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, better-sqlite3, bcryptjs, node-cron, canvas-confetti, OpenAI SDK (DALL-E 3), Fredoka One + Nunito fonts.

---

## File Map

| File | Responsibility |
|---|---|
| `lib/db.ts` | SQLite connection, schema init, WAL mode |
| `lib/auth.ts` | PIN hash/verify (bcryptjs) |
| `lib/grid.ts` | `computeGridLayout(count)` — cols/rows to fill viewport |
| `lib/points.ts` | `centsToDisplay()`, `pointsToCents()` helpers |
| `lib/scheduler.ts` | node-cron jobs: daily reset + routine switch |
| `instrumentation.ts` | Starts scheduler on server boot |
| `app/layout.tsx` | Root layout, fonts, CSS vars |
| `app/globals.css` | CSS custom properties, base reset |
| `app/page.tsx` | Main chore screen |
| `app/cashin/[memberId]/page.tsx` | Cash-in allocation screen |
| `app/admin/page.tsx` | Admin panel (PIN gated) |
| `app/api/members/route.ts` | GET/POST/PUT/DELETE members |
| `app/api/chores/route.ts` | GET/POST/PUT/DELETE chores |
| `app/api/completions/route.ts` | GET/POST/DELETE completions |
| `app/api/points/route.ts` | GET points balances, POST allocate, POST admin-add |
| `app/api/settings/route.ts` | GET/PUT schedule + PIN hash |
| `app/api/generate-image/route.ts` | POST → DALL-E 3 → save PNG |
| `app/api/upload-photo/route.ts` | POST multipart → save member photo |
| `components/MemberSelector.tsx` | Three member buttons with colour theming |
| `components/ChoreGrid.tsx` | Responsive grid, fills viewport height |
| `components/ChoreCard.tsx` | Single chore card with image + completion toggle |
| `components/BottomBar.tsx` | Points, bucket balances, settings gear |
| `components/PinGate.tsx` | 4-digit PIN entry keypad |
| `components/admin/AdminShell.tsx` | Sidebar + tab router |
| `components/admin/MembersTab.tsx` | CRUD members, photo upload, colour picker |
| `components/admin/ChoresTab.tsx` | CRUD chores, image status |
| `components/admin/ScheduleTab.tsx` | Morning/afternoon/reset times |
| `components/admin/PointsPayTab.tsx` | Balances, mark paid, manual add, completion ratio |
| `components/admin/ChangePinTab.tsx` | 3-step PIN change |
| `components/cashin/BucketColumn.tsx` | Single Spend/Save/Give column |
| `components/cashin/AllocationFooter.tsx` | Remaining pill + Confirm button |
| `hooks/useRoutine.ts` | Current routine (morning/afternoon) from settings |
| `hooks/useMembers.ts` | Members list with SWR |
| `hooks/useChores.ts` | Chores + completions for active member |
| `hooks/usePoints.ts` | Point balances for a member |

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`

- [ ] **Step 1: Bootstrap Next.js app**

```bash
npx create-next-app@14 family-chore-app \
  --typescript --tailwind --app --src-dir no \
  --import-alias "@/*" --eslint
cd family-chore-app
```

- [ ] **Step 2: Install dependencies**

```bash
npm install better-sqlite3 bcryptjs node-cron openai canvas-confetti
npm install -D @types/better-sqlite3 @types/bcryptjs @types/node-cron @types/canvas-confetti
```

- [ ] **Step 3: Add Google Fonts to `app/layout.tsx`**

```tsx
import { Fredoka_One, Nunito } from 'next/font/google'

const fredoka = Fredoka_One({ weight: '400', subsets: ['latin'], variable: '--font-fredoka' })
const nunito = Nunito({ subsets: ['latin'], variable: '--font-nunito' })
```

- [ ] **Step 4: Update `next.config.ts` to allow SQLite on server and mark `canvas-confetti` as client-only**

```ts
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: { instrumentationHook: true },
  serverExternalPackages: ['better-sqlite3'],
}

export default nextConfig
```

- [ ] **Step 5: Create `/public/chore-images/.gitkeep` and `/public/member-photos/.gitkeep`**

```bash
mkdir -p public/chore-images public/member-photos
touch public/chore-images/.gitkeep public/member-photos/.gitkeep
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: scaffold Next.js 14 app with deps"
```

---

## Task 2: Database Schema (`lib/db.ts`)

**Files:**
- Create: `lib/db.ts`
- Test: `lib/__tests__/db.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// lib/__tests__/db.test.ts
import { getDb } from '../db'

test('schema initialises all tables', () => {
  const db = getDb()
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r: any) => r.name)

  expect(tables).toContain('members')
  expect(tables).toContain('chores')
  expect(tables).toContain('chore_assignments')
  expect(tables).toContain('completions')
  expect(tables).toContain('point_balances')
  expect(tables).toContain('point_transactions')
  expect(tables).toContain('settings')
})

test('default settings are seeded', () => {
  const db = getDb()
  const val = db.prepare("SELECT value FROM settings WHERE key='daily_reset_time'").get() as any
  expect(val?.value).toBe('00:00')
})
```

- [ ] **Step 2: Run test — confirm FAIL**

```bash
npx jest lib/__tests__/db.test.ts
```
Expected: FAIL — `Cannot find module '../db'`

- [ ] **Step 3: Implement `lib/db.ts`**

```ts
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'chores.db')

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
  _db = new Database(DB_PATH)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  initSchema(_db)
  return _db
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT NOT NULL,
      age              INTEGER NOT NULL,
      colour           TEXT NOT NULL DEFAULT '#6366f1',
      photo_path       TEXT,
      point_value_cents INTEGER NOT NULL DEFAULT 10,
      streak_days      INTEGER NOT NULL DEFAULT 0,
      last_streak_date TEXT,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chores (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      image_path   TEXT,
      image_status TEXT NOT NULL DEFAULT 'pending',
      points       INTEGER NOT NULL DEFAULT 1,
      routine      TEXT NOT NULL DEFAULT 'morning',
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chore_assignments (
      chore_id  INTEGER NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      PRIMARY KEY (chore_id, member_id)
    );

    CREATE TABLE IF NOT EXISTS completions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      chore_id     INTEGER NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
      member_id    INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      date         TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS point_balances (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id     INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      bucket        TEXT NOT NULL,
      balance_cents INTEGER NOT NULL DEFAULT 0,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(member_id, bucket)
    );

    CREATE TABLE IF NOT EXISTS point_transactions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id    INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      bucket       TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      reason       TEXT NOT NULL,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // Seed default settings
  const defaults: [string, string][] = [
    ['morning_start_time', '06:00'],
    ['afternoon_start_time', '12:00'],
    ['daily_reset_time', '00:00'],
    ['admin_pin_hash', ''],
  ]
  const upsert = db.prepare(
    `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`
  )
  for (const [k, v] of defaults) upsert.run(k, v)
}
```

- [ ] **Step 4: Run test — confirm PASS**

```bash
npx jest lib/__tests__/db.test.ts
```
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts lib/__tests__/db.test.ts
git commit -m "feat: SQLite schema with WAL mode and default settings"
```

---

## Task 3: Auth Utilities (`lib/auth.ts`)

**Files:**
- Create: `lib/auth.ts`
- Test: `lib/__tests__/auth.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// lib/__tests__/auth.test.ts
import { hashPin, verifyPin, DEFAULT_PIN } from '../auth'

test('DEFAULT_PIN is 0000', () => {
  expect(DEFAULT_PIN).toBe('0000')
})

test('hashPin produces a bcrypt hash', async () => {
  const hash = await hashPin('1234')
  expect(hash).toMatch(/^\$2/)
})

test('verifyPin returns true for correct PIN against hash', async () => {
  const hash = await hashPin('5678')
  expect(await verifyPin('5678', hash)).toBe(true)
  expect(await verifyPin('0000', hash)).toBe(false)
})

test('verifyPin falls back to DEFAULT_PIN when hash is empty', async () => {
  expect(await verifyPin('0000', '')).toBe(true)
  expect(await verifyPin('9999', '')).toBe(false)
})
```

- [ ] **Step 2: Run test — confirm FAIL**

```bash
npx jest lib/__tests__/auth.test.ts
```

- [ ] **Step 3: Implement `lib/auth.ts`**

```ts
import bcrypt from 'bcryptjs'

export const DEFAULT_PIN = '0000'

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10)
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  if (!hash) return pin === DEFAULT_PIN
  return bcrypt.compare(pin, hash)
}
```

- [ ] **Step 4: Run test — confirm PASS**

```bash
npx jest lib/__tests__/auth.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/auth.ts lib/__tests__/auth.test.ts
git commit -m "feat: PIN auth with bcryptjs, default 0000"
```

---

## Task 4: Grid Layout Utility (`lib/grid.ts`)

**Files:**
- Create: `lib/grid.ts`
- Test: `lib/__tests__/grid.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// lib/__tests__/grid.test.ts
import { computeGridLayout } from '../grid'

test('1 chore → 1 col, 1 row', () => {
  expect(computeGridLayout(1)).toEqual({ cols: 1, rows: 1 })
})

test('5 chores → 5 cols, 1 row', () => {
  expect(computeGridLayout(5)).toEqual({ cols: 5, rows: 1 })
})

test('6 chores → 3 cols, 2 rows', () => {
  expect(computeGridLayout(6)).toEqual({ cols: 3, rows: 2 })
})

test('15 chores → 5 cols, 3 rows', () => {
  expect(computeGridLayout(15)).toEqual({ cols: 5, rows: 3 })
})

test('0 chores → 1 col, 1 row (safe fallback)', () => {
  expect(computeGridLayout(0)).toEqual({ cols: 1, rows: 1 })
})
```

- [ ] **Step 2: Run test — confirm FAIL**

```bash
npx jest lib/__tests__/grid.test.ts
```

- [ ] **Step 3: Implement `lib/grid.ts`**

```ts
export interface GridLayout {
  cols: number
  rows: number
}

/**
 * Given a chore count, returns the smallest (cols × rows) grid
 * where rows ≤ 3 and cols ≤ 5 that fits all chores.
 * Cards fill the available height with no scrolling required.
 */
export function computeGridLayout(count: number): GridLayout {
  const n = Math.max(1, count)
  for (let rows = 1; rows <= 3; rows++) {
    const cols = Math.ceil(n / rows)
    if (cols <= 5) return { cols, rows }
  }
  // Fallback: max grid
  return { cols: 5, rows: 3 }
}
```

- [ ] **Step 4: Run test — confirm PASS**

```bash
npx jest lib/__tests__/grid.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/grid.ts lib/__tests__/grid.test.ts
git commit -m "feat: grid layout calculator for chore cards"
```

---

## Task 5: Points Helpers (`lib/points.ts`)

**Files:**
- Create: `lib/points.ts`
- Test: `lib/__tests__/points.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// lib/__tests__/points.test.ts
import { centsToDisplay, pointsToCents } from '../points'

test('centsToDisplay formats cents as dollars', () => {
  expect(centsToDisplay(0)).toBe('$0.00')
  expect(centsToDisplay(305)).toBe('$3.05')
  expect(centsToDisplay(1000)).toBe('$10.00')
})

test('pointsToCents converts points to cents', () => {
  expect(pointsToCents(10, 10)).toBe(100)   // 10 pts × 10c = $1.00
  expect(pointsToCents(3, 5)).toBe(15)       // 3 pts × 5c = $0.15
})
```

- [ ] **Step 2: Run test — confirm FAIL**

```bash
npx jest lib/__tests__/points.test.ts
```

- [ ] **Step 3: Implement `lib/points.ts`**

```ts
export function centsToDisplay(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function pointsToCents(points: number, pointValueCents: number): number {
  return points * pointValueCents
}
```

- [ ] **Step 4: Run test — confirm PASS**

```bash
npx jest lib/__tests__/points.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/points.ts lib/__tests__/points.test.ts
git commit -m "feat: points/cents conversion helpers"
```

---

## Task 6: Scheduler (`lib/scheduler.ts` + `instrumentation.ts`)

**Files:**
- Create: `lib/scheduler.ts`
- Create: `instrumentation.ts`

- [ ] **Step 1: Implement `lib/scheduler.ts`**

```ts
import cron from 'node-cron'
import { getDb } from './db'

function todayString(): string {
  return new Date().toISOString().slice(0, 10)
}

function getSetting(key: string): string {
  const row = getDb()
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row?.value ?? ''
}

export function startScheduler() {
  // Daily reset — runs every minute, checks if now matches reset time
  cron.schedule('* * * * *', () => {
    const resetTime = getSetting('daily_reset_time') || '00:00'
    const [hh, mm] = resetTime.split(':').map(Number)
    const now = new Date()
    if (now.getHours() === hh && now.getMinutes() === mm) {
      const yesterday = new Date(now.getTime() - 86400000)
        .toISOString()
        .slice(0, 10)
      getDb()
        .prepare("DELETE FROM completions WHERE date = ?")
        .run(yesterday)
      console.log(`[scheduler] Daily reset complete for ${yesterday}`)
    }
  })

  console.log('[scheduler] Started')
}
```

- [ ] **Step 2: Implement `instrumentation.ts`**

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./lib/scheduler')
    startScheduler()
  }
}
```

- [ ] **Step 3: Verify the file is picked up — start dev server and check console**

```bash
npm run dev
```
Expected: `[scheduler] Started` printed in terminal within a few seconds.

- [ ] **Step 4: Commit**

```bash
git add lib/scheduler.ts instrumentation.ts
git commit -m "feat: node-cron daily reset scheduler via instrumentation hook"
```

---

## Task 7: API — Members (`app/api/members/route.ts`)

**Files:**
- Create: `app/api/members/route.ts`

- [ ] **Step 1: Implement route**

```ts
// app/api/members/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export function GET() {
  const members = getDb().prepare('SELECT * FROM members ORDER BY id').all()
  return NextResponse.json(members)
}

export async function POST(req: NextRequest) {
  const { name, age, colour, point_value_cents } = await req.json()
  const db = getDb()
  const result = db
    .prepare(
      'INSERT INTO members (name, age, colour, point_value_cents) VALUES (?, ?, ?, ?)'
    )
    .run(name, age, colour ?? '#6366f1', point_value_cents ?? 10)

  const memberId = result.lastInsertRowid as number

  // Seed the four balance buckets
  const buckets = ['unallocated', 'spend', 'save', 'give']
  const ins = db.prepare(
    'INSERT INTO point_balances (member_id, bucket, balance_cents) VALUES (?, ?, 0)'
  )
  for (const bucket of buckets) ins.run(memberId, bucket)

  return NextResponse.json({ id: memberId }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const { id, name, age, colour, point_value_cents } = await req.json()
  getDb()
    .prepare(
      'UPDATE members SET name=?, age=?, colour=?, point_value_cents=? WHERE id=?'
    )
    .run(name, age, colour, point_value_cents, id)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  getDb().prepare('DELETE FROM members WHERE id=?').run(id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Manual smoke test**

```bash
# Start dev server if not running
npm run dev

# Create a member
curl -X POST http://localhost:3000/api/members \
  -H "Content-Type: application/json" \
  -d '{"name":"Mia","age":5,"colour":"#f97316","point_value_cents":10}'
# Expected: {"id":1}

# List members
curl http://localhost:3000/api/members
# Expected: [{id:1, name:"Mia", ...}]
```

- [ ] **Step 3: Commit**

```bash
git add app/api/members/route.ts
git commit -m "feat: members CRUD API with balance bucket seeding"
```

---

## Task 8: API — Chores (`app/api/chores/route.ts`)

**Files:**
- Create: `app/api/chores/route.ts`

- [ ] **Step 1: Implement route**

```ts
// app/api/chores/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export function GET() {
  const db = getDb()
  const chores = db.prepare('SELECT * FROM chores ORDER BY id').all()
  const assignments = db.prepare('SELECT * FROM chore_assignments').all() as {
    chore_id: number
    member_id: number
  }[]
  const byChore: Record<number, number[]> = {}
  for (const a of assignments) {
    if (!byChore[a.chore_id]) byChore[a.chore_id] = []
    byChore[a.chore_id].push(a.member_id)
  }
  const result = (chores as any[]).map((c) => ({
    ...c,
    member_ids: byChore[c.id] ?? [],
  }))
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const { name, points, routine, member_ids } = await req.json()
  const db = getDb()
  const { lastInsertRowid } = db
    .prepare(
      'INSERT INTO chores (name, points, routine, image_status) VALUES (?, ?, ?, ?)'
    )
    .run(name, points ?? 1, routine ?? 'morning', 'pending')

  const choreId = lastInsertRowid as number
  const ins = db.prepare(
    'INSERT INTO chore_assignments (chore_id, member_id) VALUES (?, ?)'
  )
  for (const mid of member_ids ?? []) ins.run(choreId, mid)

  return NextResponse.json({ id: choreId }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const { id, name, points, routine, member_ids, image_status, image_path } =
    await req.json()
  const db = getDb()
  db.prepare(
    `UPDATE chores SET name=?, points=?, routine=?,
      image_status=COALESCE(?, image_status),
      image_path=COALESCE(?, image_path)
    WHERE id=?`
  ).run(name, points, routine, image_status ?? null, image_path ?? null, id)

  if (member_ids !== undefined) {
    db.prepare('DELETE FROM chore_assignments WHERE chore_id=?').run(id)
    const ins = db.prepare(
      'INSERT INTO chore_assignments (chore_id, member_id) VALUES (?, ?)'
    )
    for (const mid of member_ids) ins.run(id, mid)
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  getDb().prepare('DELETE FROM chores WHERE id=?').run(id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Smoke test**

```bash
curl -X POST http://localhost:3000/api/chores \
  -H "Content-Type: application/json" \
  -d '{"name":"Make Bed","points":2,"routine":"morning","member_ids":[1]}'
# Expected: {"id":1}

curl http://localhost:3000/api/chores
# Expected: [{id:1, name:"Make Bed", member_ids:[1], ...}]
```

- [ ] **Step 3: Commit**

```bash
git add app/api/chores/route.ts
git commit -m "feat: chores CRUD API with member assignments"
```

---

## Task 9: API — Completions (`app/api/completions/route.ts`)

**Files:**
- Create: `app/api/completions/route.ts`

- [ ] **Step 1: Implement route**

```ts
// app/api/completions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// GET /api/completions?date=YYYY-MM-DD&member_id=N
export function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
  const memberId = searchParams.get('member_id')

  let query = 'SELECT * FROM completions WHERE date = ?'
  const params: (string | number)[] = [date]
  if (memberId) {
    query += ' AND member_id = ?'
    params.push(Number(memberId))
  }

  const rows = getDb().prepare(query).all(...params)
  return NextResponse.json(rows)
}

// POST /api/completions — mark a chore complete, credit unallocated points
export async function POST(req: NextRequest) {
  const { chore_id, member_id } = await req.json()
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)

  // Idempotent — ignore if already completed today
  const existing = db
    .prepare(
      'SELECT id FROM completions WHERE chore_id=? AND member_id=? AND date=?'
    )
    .get(chore_id, member_id, today)
  if (existing) return NextResponse.json({ ok: true, duplicate: true })

  const chore = db.prepare('SELECT points FROM chores WHERE id=?').get(chore_id) as
    | { points: number }
    | undefined
  const member = db
    .prepare('SELECT point_value_cents FROM members WHERE id=?')
    .get(member_id) as { point_value_cents: number } | undefined

  if (!chore || !member) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const earnedCents = chore.points * member.point_value_cents

  db.transaction(() => {
    db.prepare(
      'INSERT INTO completions (chore_id, member_id, date) VALUES (?, ?, ?)'
    ).run(chore_id, member_id, today)

    db.prepare(
      `UPDATE point_balances SET balance_cents = balance_cents + ?, updated_at = CURRENT_TIMESTAMP
       WHERE member_id = ? AND bucket = 'unallocated'`
    ).run(earnedCents, member_id)

    db.prepare(
      `INSERT INTO point_transactions (member_id, bucket, amount_cents, reason)
       VALUES (?, 'unallocated', ?, 'chore_complete')`
    ).run(member_id, earnedCents)
  })()

  return NextResponse.json({ ok: true, earned_cents: earnedCents }, { status: 201 })
}

// DELETE /api/completions — un-complete a chore
export async function DELETE(req: NextRequest) {
  const { chore_id, member_id } = await req.json()
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)

  const row = db
    .prepare(
      'SELECT id FROM completions WHERE chore_id=? AND member_id=? AND date=?'
    )
    .get(chore_id, member_id, today) as { id: number } | undefined
  if (!row) return NextResponse.json({ ok: true, not_found: true })

  const chore = db.prepare('SELECT points FROM chores WHERE id=?').get(chore_id) as
    | { points: number }
    | undefined
  const member = db
    .prepare('SELECT point_value_cents FROM members WHERE id=?')
    .get(member_id) as { point_value_cents: number } | undefined

  if (!chore || !member) return NextResponse.json({ ok: true })

  const earnedCents = chore.points * member.point_value_cents

  db.transaction(() => {
    db.prepare('DELETE FROM completions WHERE id=?').run(row.id)
    db.prepare(
      `UPDATE point_balances SET balance_cents = MAX(0, balance_cents - ?), updated_at = CURRENT_TIMESTAMP
       WHERE member_id = ? AND bucket = 'unallocated'`
    ).run(earnedCents, member_id)
    db.prepare(
      `INSERT INTO point_transactions (member_id, bucket, amount_cents, reason)
       VALUES (?, 'unallocated', ?, 'chore_complete')`
    ).run(member_id, -earnedCents)
  })()

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/completions/route.ts
git commit -m "feat: completions API with idempotent point crediting"
```

---

## Task 10: API — Points, Settings, Generate-Image, Upload-Photo

**Files:**
- Create: `app/api/points/route.ts`
- Create: `app/api/settings/route.ts`
- Create: `app/api/generate-image/route.ts`
- Create: `app/api/upload-photo/route.ts`

- [ ] **Step 1: Implement `app/api/points/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// GET /api/points?member_id=N
export function GET(req: NextRequest) {
  const memberId = new URL(req.url).searchParams.get('member_id')
  if (!memberId) return NextResponse.json({ error: 'member_id required' }, { status: 400 })
  const rows = getDb()
    .prepare('SELECT bucket, balance_cents FROM point_balances WHERE member_id=?')
    .all(Number(memberId))
  return NextResponse.json(rows)
}

// POST /api/points  — action: 'allocate' | 'admin_add' | 'payout'
export async function POST(req: NextRequest) {
  const body = await req.json()
  const db = getDb()

  if (body.action === 'allocate') {
    // { action, member_id, allocations: {spend, save, give} (cents) }
    const { member_id, allocations } = body
    const total = (allocations.spend ?? 0) + (allocations.save ?? 0) + (allocations.give ?? 0)
    const unalloc = db
      .prepare("SELECT balance_cents FROM point_balances WHERE member_id=? AND bucket='unallocated'")
      .get(member_id) as { balance_cents: number } | undefined

    if (!unalloc || unalloc.balance_cents < total) {
      return NextResponse.json({ error: 'Insufficient unallocated balance' }, { status: 400 })
    }

    db.transaction(() => {
      for (const bucket of ['spend', 'save', 'give'] as const) {
        const amt = allocations[bucket] ?? 0
        if (amt <= 0) continue
        db.prepare(
          `UPDATE point_balances SET balance_cents=balance_cents+?, updated_at=CURRENT_TIMESTAMP
           WHERE member_id=? AND bucket=?`
        ).run(amt, member_id, bucket)
        db.prepare(
          `UPDATE point_balances SET balance_cents=balance_cents-?, updated_at=CURRENT_TIMESTAMP
           WHERE member_id=? AND bucket='unallocated'`
        ).run(amt, member_id)
        db.prepare(
          `INSERT INTO point_transactions (member_id, bucket, amount_cents, reason) VALUES (?,?,?,'allocation')`
        ).run(member_id, bucket, amt)
      }
    })()
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'admin_add') {
    // { action, member_id, bucket, amount_cents }
    const { member_id, bucket, amount_cents } = body
    db.prepare(
      `UPDATE point_balances SET balance_cents=balance_cents+?, updated_at=CURRENT_TIMESTAMP
       WHERE member_id=? AND bucket=?`
    ).run(amount_cents, member_id, bucket)
    db.prepare(
      `INSERT INTO point_transactions (member_id, bucket, amount_cents, reason) VALUES (?,?,?,'admin_add')`
    ).run(member_id, bucket, amount_cents)
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'payout') {
    // { action, member_id } — zero all buckets
    const { member_id } = body
    db.transaction(() => {
      for (const bucket of ['spend', 'save', 'give', 'unallocated']) {
        const row = db
          .prepare('SELECT balance_cents FROM point_balances WHERE member_id=? AND bucket=?')
          .get(member_id, bucket) as { balance_cents: number } | undefined
        if (row && row.balance_cents > 0) {
          db.prepare(
            `UPDATE point_balances SET balance_cents=0, updated_at=CURRENT_TIMESTAMP
             WHERE member_id=? AND bucket=?`
          ).run(member_id, bucket)
          db.prepare(
            `INSERT INTO point_transactions (member_id, bucket, amount_cents, reason) VALUES (?,?,?,'payout')`
          ).run(member_id, bucket, -row.balance_cents)
        }
      }
    })()
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
```

- [ ] **Step 2: Implement `app/api/settings/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { hashPin, verifyPin } from '@/lib/auth'

export function GET() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as {
    key: string
    value: string
  }[]
  const result: Record<string, string> = {}
  for (const { key, value } of rows) result[key] = value
  // Never send the hash to the client
  delete result['admin_pin_hash']
  return NextResponse.json(result)
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const db = getDb()
  const upsert = db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`)

  // Handle PIN change: { action:'change_pin', current_pin, new_pin }
  if (body.action === 'change_pin') {
    const currentHash = (
      db.prepare("SELECT value FROM settings WHERE key='admin_pin_hash'").get() as any
    )?.value ?? ''
    if (!(await verifyPin(body.current_pin, currentHash))) {
      return NextResponse.json({ error: 'Incorrect PIN' }, { status: 403 })
    }
    const newHash = await hashPin(body.new_pin)
    upsert.run('admin_pin_hash', newHash)
    return NextResponse.json({ ok: true })
  }

  // Regular settings update
  const allowed = ['morning_start_time', 'afternoon_start_time', 'daily_reset_time']
  for (const key of allowed) {
    if (body[key] !== undefined) upsert.run(key, body[key])
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Implement `app/api/generate-image/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import OpenAI from 'openai'
import https from 'https'
import fs from 'fs'
import path from 'path'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    https.get(url, (res) => {
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
    }).on('error', reject)
  })
}

export async function POST(req: NextRequest) {
  const { chore_id, chore_name } = await req.json()
  const db = getDb()

  // Mark as pending before async work
  db.prepare("UPDATE chores SET image_status='pending' WHERE id=?").run(chore_id)

  try {
    const prompt = `A simple, bright, friendly illustration of a child ${chore_name}, cartoon style, white background, suitable for young children`
    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
    })

    const imageUrl = response.data[0].url!
    const destPath = path.join(process.cwd(), 'public', 'chore-images', `${chore_id}.png`)
    await downloadFile(imageUrl, destPath)

    db.prepare(
      "UPDATE chores SET image_path=?, image_status='ready' WHERE id=?"
    ).run(`/chore-images/${chore_id}.png`, chore_id)

    return NextResponse.json({ ok: true, image_path: `/chore-images/${chore_id}.png` })
  } catch (err: any) {
    db.prepare("UPDATE chores SET image_status='failed' WHERE id=?").run(chore_id)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

- [ ] **Step 4: Implement `app/api/upload-photo/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import fs from 'fs'
import path from 'path'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('photo') as File | null
  const memberId = formData.get('member_id') as string | null

  if (!file || !memberId) {
    return NextResponse.json({ error: 'photo and member_id required' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() ?? 'jpg'
  const filename = `member-${memberId}.${ext}`
  const destPath = path.join(process.cwd(), 'public', 'member-photos', filename)

  const buffer = Buffer.from(await file.arrayBuffer())
  fs.writeFileSync(destPath, buffer)

  const photoPath = `/member-photos/${filename}`
  getDb()
    .prepare('UPDATE members SET photo_path=? WHERE id=?')
    .run(photoPath, Number(memberId))

  return NextResponse.json({ ok: true, photo_path: photoPath })
}
```

- [ ] **Step 5: Add `OPENAI_API_KEY` to `.env.local`**

```bash
echo "OPENAI_API_KEY=sk-..." >> .env.local
```

- [ ] **Step 6: Commit**

```bash
git add app/api/points/route.ts app/api/settings/route.ts \
        app/api/generate-image/route.ts app/api/upload-photo/route.ts
git commit -m "feat: points, settings, generate-image, upload-photo APIs"
```

---

## Task 11: Global Layout + CSS Variables

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Update `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --font-fredoka: 'Fredoka One', cursive;
  --font-nunito: 'Nunito', sans-serif;
  --accent: #6366f1;
  --accent-dim: rgba(99, 102, 241, 0.15);
  --bg-tint: #0d0d1a;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  width: 100vw; height: 100vh;
  overflow: hidden;
  background: var(--bg-tint);
  color: white;
  font-family: var(--font-nunito);
  touch-action: manipulation;
}

.no-select { user-select: none; -webkit-user-select: none; }
```

- [ ] **Step 2: Update `app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import { Fredoka_One, Nunito } from 'next/font/google'
import './globals.css'

const fredoka = Fredoka_One({
  weight: '400', subsets: ['latin'],
  variable: '--font-fredoka', display: 'swap',
})
const nunito = Nunito({
  subsets: ['latin'], variable: '--font-nunito', display: 'swap',
})

export const metadata: Metadata = { title: 'ChoreChart' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fredoka.variable} ${nunito.variable}`}>
      <body className="no-select">{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx app/globals.css
git commit -m "feat: global layout with CSS variables and font setup"
```

---

## Task 12: Data Hooks

**Files:**
- Create: `hooks/useRoutine.ts`
- Create: `hooks/useMembers.ts`
- Create: `hooks/useChores.ts`
- Create: `hooks/usePoints.ts`

- [ ] **Step 1: Install SWR**

```bash
npm install swr
```

- [ ] **Step 2: Create `hooks/useMembers.ts`**

```ts
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export interface Member {
  id: number
  name: string
  age: number
  colour: string
  photo_path: string | null
  point_value_cents: number
  streak_days: number
}

export function useMembers() {
  const { data, error, mutate } = useSWR<Member[]>('/api/members', fetcher)
  return { members: data ?? [], loading: !data && !error, mutate }
}
```

- [ ] **Step 3: Create `hooks/useChores.ts`**

```ts
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export interface Chore {
  id: number
  name: string
  image_path: string | null
  image_status: 'pending' | 'ready' | 'failed'
  points: number
  routine: 'morning' | 'afternoon' | 'both'
  member_ids: number[]
}

export interface Completion {
  id: number; chore_id: number; member_id: number; date: string
}

export function useChores(memberId: number | null, routine: 'morning' | 'afternoon', date: string) {
  const { data: allChores, mutate: mutateChores } = useSWR<Chore[]>('/api/chores', fetcher)
  const { data: completions, mutate: mutateCompletions } = useSWR<Completion[]>(
    memberId ? `/api/completions?date=${date}&member_id=${memberId}` : null,
    fetcher, { refreshInterval: 5000 }
  )
  const chores = (allChores ?? []).filter(
    (c) => memberId !== null &&
      c.member_ids.includes(memberId) &&
      (c.routine === routine || c.routine === 'both')
  )
  const completedIds = new Set((completions ?? []).map((c) => c.chore_id))
  return { chores, completedIds, mutateChores, mutateCompletions }
}
```

- [ ] **Step 4: Create `hooks/usePoints.ts`**

```ts
import useSWR from 'swr'
import { centsToDisplay } from '@/lib/points'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function usePoints(memberId: number | null) {
  const { data, mutate } = useSWR<{ bucket: string; balance_cents: number }[]>(
    memberId ? `/api/points?member_id=${memberId}` : null,
    fetcher, { refreshInterval: 5000 }
  )
  const get = (bucket: string) =>
    (data ?? []).find((b) => b.bucket === bucket)?.balance_cents ?? 0
  return {
    unallocated: get('unallocated'),
    spend: get('spend'),
    save: get('save'),
    give: get('give'),
    unallocatedDisplay: centsToDisplay(get('unallocated')),
    spendDisplay: centsToDisplay(get('spend')),
    saveDisplay: centsToDisplay(get('save')),
    giveDisplay: centsToDisplay(get('give')),
    mutate,
  }
}
```

- [ ] **Step 5: Create `hooks/useRoutine.ts`**

```ts
import { useState, useEffect } from 'react'
export type Routine = 'morning' | 'afternoon'

export function useRoutine(afternoonTime = '12:00'): Routine {
  const getRoutine = (): Routine => {
    const now = new Date()
    const [h, m] = afternoonTime.split(':').map(Number)
    return now.getHours() * 60 + now.getMinutes() >= h * 60 + m ? 'afternoon' : 'morning'
  }
  const [routine, setRoutine] = useState<Routine>(getRoutine)
  useEffect(() => {
    const t = setInterval(() => setRoutine(getRoutine()), 60_000)
    return () => clearInterval(t)
  }, [afternoonTime])
  return routine
}
```

- [ ] **Step 6: Commit**

```bash
git add hooks/ package.json package-lock.json
git commit -m "feat: SWR hooks for members, chores, points, routine"
```

---

## Task 13: MemberSelector Component

**Files:**
- Create: `components/MemberSelector.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client'
import Image from 'next/image'
import type { Member } from '@/hooks/useMembers'

interface Props {
  members: Member[]
  activeMemberId: number | null
  onSelect: (id: number) => void
}

export default function MemberSelector({ members, activeMemberId, onSelect }: Props) {
  return (
    <div className="flex gap-3 px-4 py-2 flex-shrink-0">
      {members.map((m) => {
        const active = m.id === activeMemberId
        return (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-2xl border-2 transition-all duration-200 flex-1"
            style={{
              borderColor: active ? m.colour : 'transparent',
              background: active ? `${m.colour}22` : 'rgba(255,255,255,0.05)',
              opacity: active ? 1 : 0.5,
            }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0 overflow-hidden"
              style={{ background: m.colour }}
            >
              {m.photo_path ? (
                <Image src={m.photo_path} alt={m.name} width={40} height={40} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white">{m.name[0]}</span>
              )}
            </div>
            <div className="text-left">
              <div className="font-bold text-sm" style={{ fontFamily: 'var(--font-fredoka)', color: active ? m.colour : 'white' }}>
                {m.name}
              </div>
              <div className="text-xs text-white/50">age {m.age}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/MemberSelector.tsx
git commit -m "feat: MemberSelector with colour theming and photo support"
```

---

## Task 14: ChoreCard Component

**Files:**
- Create: `components/ChoreCard.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client'

interface Props {
  id: number
  name: string
  imagePath: string | null
  imageStatus: 'pending' | 'ready' | 'failed'
  completed: boolean
  accentColour: string
  onToggle: (id: number) => void
}

export default function ChoreCard({ id, name, imagePath, imageStatus, completed, accentColour, onToggle }: Props) {
  return (
    <button
      onClick={() => onToggle(id)}
      className="relative rounded-2xl overflow-hidden transition-all duration-200 active:scale-95 w-full h-full"
      style={{
        background: 'rgba(255,255,255,0.07)',
        border: `2px solid ${completed ? accentColour : 'rgba(255,255,255,0.1)'}`,
        opacity: completed ? 0.65 : 1,
        display: 'grid',
        gridTemplateRows: '1fr auto',
        contain: 'strict',
      }}
    >
      <div className="w-full h-full overflow-hidden flex items-center justify-center bg-black/20">
        {imageStatus === 'ready' && imagePath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagePath} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-4xl">{imageStatus === 'failed' ? '⚠️' : '⏳'}</span>
        )}
      </div>
      <div className="px-1 py-1 text-center text-xs font-bold text-white/90 bg-black/40 leading-tight">
        {name}
      </div>
      {completed && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: `${accentColour}33` }}>
          <span className="text-5xl drop-shadow-lg">✅</span>
        </div>
      )}
    </button>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/ChoreCard.tsx
git commit -m "feat: ChoreCard with completion overlay and pending/failed states"
```

---

## Task 15: ChoreGrid Component

**Files:**
- Create: `components/ChoreGrid.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client'
import { computeGridLayout } from '@/lib/grid'
import ChoreCard from './ChoreCard'
import type { Chore } from '@/hooks/useChores'

interface Props {
  chores: Chore[]
  completedIds: Set<number>
  accentColour: string
  onToggle: (choreId: number) => void
}

export default function ChoreGrid({ chores, completedIds, accentColour, onToggle }: Props) {
  const { cols, rows } = computeGridLayout(chores.length)

  if (chores.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/30 text-lg">
        No chores for this routine 🎉
      </div>
    )
  }

  return (
    <div
      className="flex-1 min-h-0 p-3"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: '0.6rem',
      }}
    >
      {chores.map((chore) => (
        <ChoreCard
          key={chore.id}
          id={chore.id}
          name={chore.name}
          imagePath={chore.image_path}
          imageStatus={chore.image_status}
          completed={completedIds.has(chore.id)}
          accentColour={accentColour}
          onToggle={onToggle}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/ChoreGrid.tsx
git commit -m "feat: ChoreGrid with computed cols/rows to fill viewport"
```

---

## Task 16: BottomBar Component

**Files:**
- Create: `components/BottomBar.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client'
import { useRouter } from 'next/navigation'

interface Props {
  memberId: number | null
  unallocatedDisplay: string
  unallocatedCents: number
  spendDisplay: string
  saveDisplay: string
  giveDisplay: string
  accentColour: string
  streakDays: number
}

export default function BottomBar({
  memberId, unallocatedDisplay, unallocatedCents,
  spendDisplay, saveDisplay, giveDisplay, accentColour, streakDays,
}: Props) {
  const router = useRouter()
  return (
    <div className="flex items-center gap-4 px-4 py-2 flex-shrink-0"
      style={{ background: 'rgba(0,0,0,0.35)', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
      <button
        onClick={() => memberId && unallocatedCents > 0 && router.push(`/cashin/${memberId}`)}
        disabled={unallocatedCents === 0}
        className="flex flex-col items-start"
        style={{ opacity: unallocatedCents > 0 ? 1 : 0.4 }}
      >
        <span className="text-2xl font-bold leading-tight"
          style={{ fontFamily: 'var(--font-fredoka)', color: accentColour }}>
          {unallocatedDisplay}
        </span>
        <span className="text-xs text-white/40">
          {unallocatedCents > 0 ? 'tap to cash in' : 'to allocate'}
        </span>
      </button>
      {streakDays > 1 && (
        <div className="text-sm font-bold text-orange-400">🔥 {streakDays}</div>
      )}
      <div className="flex-1" />
      <div className="flex gap-4 text-sm">
        {[
          { label: '🛍️ Spend', val: spendDisplay, col: '#fb923c' },
          { label: '🏦 Save',  val: saveDisplay,  col: '#60a5fa' },
          { label: '🤝 Give',  val: giveDisplay,  col: '#4ade80' },
        ].map(({ label, val, col }) => (
          <div key={label} className="text-center">
            <div className="font-bold" style={{ color: col }}>{val}</div>
            <div className="text-white/40 text-xs">{label}</div>
          </div>
        ))}
      </div>
      <button onClick={() => router.push('/admin')} className="text-2xl text-white/30 hover:text-white/70 ml-2">⚙</button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/BottomBar.tsx
git commit -m "feat: BottomBar with points, buckets, streak badge, admin gear"
```

---

## Task 17: Main Page (`app/page.tsx`)

**Files:**
- Create: `app/page.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client'
import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { useMembers } from '@/hooks/useMembers'
import { useChores } from '@/hooks/useChores'
import { usePoints } from '@/hooks/usePoints'
import { useRoutine } from '@/hooks/useRoutine'
import MemberSelector from '@/components/MemberSelector'
import ChoreGrid from '@/components/ChoreGrid'
import BottomBar from '@/components/BottomBar'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function HomePage() {
  const { members } = useMembers()
  const [activeMemberId, setActiveMemberId] = useState<number | null>(null)
  const { data: settings } = useSWR('/api/settings', fetcher)
  const routine = useRoutine(settings?.afternoon_start_time ?? '12:00')
  const today = new Date().toISOString().slice(0, 10)
  const { chores, completedIds, mutateCompletions } = useChores(activeMemberId, routine, today)
  const points = usePoints(activeMemberId)

  useEffect(() => {
    if (members.length > 0 && activeMemberId === null) setActiveMemberId(members[0].id)
  }, [members])

  const activeMember = members.find((m) => m.id === activeMemberId)
  const accentColour = activeMember?.colour ?? '#6366f1'

  const handleToggle = async (choreId: number) => {
    if (!activeMemberId) return
    await fetch('/api/completions', {
      method: completedIds.has(choreId) ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chore_id: choreId, member_id: activeMemberId }),
    })
    mutateCompletions()
    points.mutate()
  }

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden transition-colors duration-500"
      style={{ background: `${accentColour}18`, position: 'relative' }}>
      <div className="absolute inset-0 pointer-events-none" style={{
        background: `radial-gradient(ellipse 80% 40% at 50% 0%, ${accentColour}28, transparent 70%)`, zIndex: 0
      }} />

      {/* Top bar */}
      <div className="relative z-10 flex items-center px-4 py-2 flex-shrink-0"
        style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <span className="text-xl mr-3" style={{ fontFamily: 'var(--font-fredoka)', color: accentColour }}>
          ⭐ ChoreChart
        </span>
        <span className="text-sm font-bold px-3 py-1 rounded-full text-white"
          style={{ background: `${accentColour}33` }}>
          {routine === 'morning' ? '☀️ MORNING' : '🌙 AFTERNOON'}
        </span>
        <span className="ml-auto text-sm text-white/50">
          {new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
        </span>
      </div>

      <div className="relative z-10">
        <MemberSelector members={members} activeMemberId={activeMemberId} onSelect={setActiveMemberId} />
      </div>

      {/* When-Then prompt */}
      {activeMember && completedIds.size === 0 && chores.length > 0 && (
        <div className="relative z-10 text-center text-sm py-1 text-white/40 italic">
          When you finish your chores, you will earn{' '}
          <span style={{ color: accentColour }}>{chores.reduce((s, c) => s + c.points, 0)} pts</span>!
        </div>
      )}

      <div className="relative z-10 flex-1 min-h-0 flex flex-col">
        <ChoreGrid chores={chores} completedIds={completedIds} accentColour={accentColour} onToggle={handleToggle} />
      </div>

      <div className="relative z-10">
        <BottomBar
          memberId={activeMemberId}
          unallocatedDisplay={points.unallocatedDisplay}
          unallocatedCents={points.unallocated}
          spendDisplay={points.spendDisplay}
          saveDisplay={points.saveDisplay}
          giveDisplay={points.giveDisplay}
          accentColour={accentColour}
          streakDays={activeMember?.streak_days ?? 0}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Smoke test**

```bash
npm run dev
# Seed data if not already done:
curl -X POST http://localhost:3000/api/members \
  -H 'Content-Type: application/json' \
  -d '{"name":"Mia","age":5,"colour":"#f97316","point_value_cents":10}'
curl -X POST http://localhost:3000/api/chores \
  -H 'Content-Type: application/json' \
  -d '{"name":"Make Bed","points":2,"routine":"morning","member_ids":[1]}'
```
Expected: Main screen renders with Mia selected, orange tint, Make Bed card in grid, when-then prompt visible.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: main chore screen with member theming, grid, when-then prompt"
```

---

## Task 18: Cash-In Screen

**Files:**
- Create: `components/cashin/BucketColumn.tsx`
- Create: `components/cashin/AllocationFooter.tsx`
- Create: `app/cashin/[memberId]/page.tsx`

- [ ] **Step 1: Create `components/cashin/BucketColumn.tsx`**

```tsx
'use client'
import { centsToDisplay } from '@/lib/points'

interface Props {
  bucket: 'spend' | 'save' | 'give'
  allocatedCents: number
  balanceCents: number
  onAdd: () => void
  onRemove: () => void
}

const CONFIG = {
  spend: { icon: '🛍️', label: 'Spend', colour: '#fb923c' },
  save:  { icon: '🏦', label: 'Save',  colour: '#60a5fa' },
  give:  { icon: '🤝', label: 'Give',  colour: '#4ade80' },
}

export default function BucketColumn({ bucket, allocatedCents, balanceCents, onAdd, onRemove }: Props) {
  const { icon, label, colour } = CONFIG[bucket]
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 py-4"
      style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="text-5xl">{icon}</div>
      <div className="text-xl font-bold text-white" style={{ fontFamily: 'var(--font-fredoka)' }}>{label}</div>
      <div className="text-4xl font-bold" style={{ fontFamily: 'var(--font-fredoka)', color: colour }}>
        {centsToDisplay(allocatedCents)}
      </div>
      <div className="flex gap-4 items-center">
        <button
          onClick={onRemove}
          disabled={allocatedCents === 0}
          className="w-14 h-14 rounded-2xl text-3xl font-black text-white"
          style={{ background: 'rgba(255,255,255,0.1)', opacity: allocatedCents === 0 ? 0.3 : 1 }}
        >−</button>
        <button
          onClick={onAdd}
          className="w-14 h-14 rounded-2xl text-3xl font-black active:scale-95 transition-transform"
          style={{ background: colour, color: bucket === 'give' ? '#111' : '#fff' }}
        >+</button>
      </div>
      <div className="text-xs text-white/40 font-bold text-center">
        Balance: <span className="text-white/70">{centsToDisplay(balanceCents)}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `components/cashin/AllocationFooter.tsx`**

```tsx
'use client'
import { centsToDisplay } from '@/lib/points'

interface Props {
  totalCents: number
  remainingCents: number
  onConfirm: () => void
}

export default function AllocationFooter({ totalCents, remainingCents, onConfirm }: Props) {
  const allDone = remainingCents === 0
  return (
    <div className="flex items-center gap-4 px-4 py-3 flex-shrink-0"
      style={{ background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="px-4 py-2 rounded-xl text-sm font-bold"
        style={{
          background: allDone ? 'rgba(74,222,128,0.1)' : 'rgba(245,158,11,0.12)',
          color: allDone ? '#4ade80' : '#f59e0b',
        }}>
        {allDone ? `All ${centsToDisplay(totalCents)} allocated ✓` : `${centsToDisplay(remainingCents)} still to allocate ⚠️`}
      </div>
      <div className="flex-1" />
      <button
        onClick={onConfirm}
        disabled={!allDone}
        className="px-6 py-3 rounded-2xl text-base font-black transition-all"
        style={{ background: allDone ? '#4ade80' : 'rgba(255,255,255,0.1)', color: allDone ? '#111' : 'rgba(255,255,255,0.3)' }}
      >
        Confirm →
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Create `app/cashin/[memberId]/page.tsx`**

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useMembers } from '@/hooks/useMembers'
import { usePoints } from '@/hooks/usePoints'
import BucketColumn from '@/components/cashin/BucketColumn'
import AllocationFooter from '@/components/cashin/AllocationFooter'

const INCREMENT = 50

export default function CashInPage() {
  const { memberId } = useParams<{ memberId: string }>()
  const mid = Number(memberId)
  const router = useRouter()
  const { members } = useMembers()
  const points = usePoints(mid)
  const [allocations, setAllocations] = useState({ spend: 0, save: 0, give: 0 })
  const member = members.find((m) => m.id === mid)
  const accentColour = member?.colour ?? '#6366f1'
  const totalCents = points.unallocated
  const allocated = allocations.spend + allocations.save + allocations.give
  const remaining = totalCents - allocated

  useEffect(() => {
    if (totalCents === 0 && points.unallocated !== undefined) router.replace('/')
  }, [totalCents])

  const add = (b: 'spend' | 'save' | 'give') => {
    if (remaining < INCREMENT) return
    setAllocations((a) => ({ ...a, [b]: a[b] + INCREMENT }))
  }
  const remove = (b: 'spend' | 'save' | 'give') =>
    setAllocations((a) => ({ ...a, [b]: Math.max(0, a[b] - INCREMENT) }))

  const handleConfirm = async () => {
    await fetch('/api/points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'allocate', member_id: mid, allocations }),
    })
    const { default: confetti } = await import('canvas-confetti')
    confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } })
    setTimeout(() => router.push('/'), 2000)
  }

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden"
      style={{ background: `${accentColour}18`, position: 'relative' }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 80% 40% at 50% 0%, ${accentColour}25, transparent 70%)`, zIndex: 0 }} />

      <div className="relative z-10 flex items-center px-4 py-3 flex-shrink-0"
        style={{ background: 'rgba(0,0,0,0.35)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <button onClick={() => router.push('/')}
          className="px-3 py-1 rounded-xl text-sm font-bold text-white/50"
          style={{ background: 'rgba(255,255,255,0.09)' }}>
          ← Back
        </button>
        <span className="ml-3 text-lg text-white" style={{ fontFamily: 'var(--font-fredoka)' }}>
          {member?.name} Cash-In
        </span>
        <div className="ml-auto text-right">
          <div className="text-xl font-bold"
            style={{ fontFamily: 'var(--font-fredoka)', color: remaining === 0 ? '#4ade80' : accentColour }}>
            ${(totalCents / 100).toFixed(2)}
          </div>
          <div className="text-xs text-white/35">{remaining === 0 ? 'all allocated' : 'to allocate'}</div>
        </div>
      </div>

      <div className="relative z-10 flex flex-1 min-h-0">
        {(['spend', 'save', 'give'] as const).map((b) => (
          <BucketColumn key={b} bucket={b}
            allocatedCents={allocations[b]} balanceCents={points[b]}
            onAdd={() => add(b)} onRemove={() => remove(b)} />
        ))}
      </div>

      <div className="relative z-10">
        <AllocationFooter totalCents={totalCents} remainingCents={remaining} onConfirm={handleConfirm} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Smoke test**

```bash
# Add unallocated points so cash-in screen is accessible
curl -X POST http://localhost:3000/api/points \
  -H 'Content-Type: application/json' \
  -d '{"action":"admin_add","member_id":1,"bucket":"unallocated","amount_cents":1550}'
# Open http://localhost:3000 → tap $15.50 in bottom bar → cash-in screen
```
Expected: Three columns, +/- in $0.50 steps, Confirm unlocks when all $15.50 split, confetti fires.

- [ ] **Step 5: Commit**

```bash
git add components/cashin/ app/cashin/
git commit -m "feat: cash-in screen with Barefoot Investor bucket allocation and confetti"
```

---

## Task 19: PinGate Component

**Files:**
- Create: `components/PinGate.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client'
import { useState, useRef } from 'react'

interface Props {
  onSuccess: () => void
}

export default function PinGate({ onSuccess }: Props) {
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [locked, setLocked] = useState(false)
  const [lockSeconds, setLockSeconds] = useState(0)
  const lockRef = useRef<NodeJS.Timeout | null>(null)

  const press = (digit: string) => {
    if (locked) return
    const next = pin + digit
    setPin(next)
    if (next.length === 4) verify(next)
  }

  const verify = async (p: string) => {
    const res = await fetch('/api/settings/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: p }),
    })
    const { ok } = await res.json()
    if (ok) {
      onSuccess()
    } else {
      const newAttempts = attempts + 1
      setAttempts(newAttempts)
      setShake(true)
      setPin('')
      setTimeout(() => setShake(false), 500)
      if (newAttempts >= 3) {
        setLocked(true)
        let secs = 30
        setLockSeconds(secs)
        const tick = setInterval(() => {
          secs -= 1
          setLockSeconds(secs)
          if (secs <= 0) {
            clearInterval(tick)
            setLocked(false)
            setAttempts(0)
          }
        }, 1000)
        lockRef.current = tick
      }
    }
  }

  const digits = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/80 z-50">
      <div
        className="flex flex-col items-center gap-6 p-8 rounded-3xl"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
          animation: shake ? 'shake 0.4s' : undefined }}
      >
        <div className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-fredoka)' }}>
          Admin PIN
        </div>

        <div className="flex gap-3">
          {[0,1,2,3].map((i) => (
            <div key={i} className="w-5 h-5 rounded-full border-2 border-white/40"
              style={{ background: pin.length > i ? 'white' : 'transparent' }} />
          ))}
        </div>

        {locked && (
          <div className="text-red-400 text-sm">Locked — try again in {lockSeconds}s</div>
        )}

        <div className="grid grid-cols-3 gap-3">
          {digits.map((d, i) => (
            <button key={i}
              onClick={() => {
                if (d === '⌫') setPin((p) => p.slice(0, -1))
                else if (d) press(d)
              }}
              disabled={locked || d === ''}
              className="w-16 h-16 rounded-2xl text-xl font-bold text-white transition-all active:scale-95"
              style={{ background: d ? 'rgba(255,255,255,0.1)' : 'transparent' }}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-8px)}
          40%{transform:translateX(8px)}
          60%{transform:translateX(-6px)}
          80%{transform:translateX(6px)}
        }
      `}</style>
    </div>
  )
}
```

- [ ] **Step 2: Add verify-pin endpoint — create `app/api/settings/verify-pin/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { verifyPin } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { pin } = await req.json()
  const hash = (getDb().prepare("SELECT value FROM settings WHERE key='admin_pin_hash'").get() as any)?.value ?? ''
  const ok = await verifyPin(pin, hash)
  return NextResponse.json({ ok })
}
```

- [ ] **Step 3: Commit**

```bash
git add components/PinGate.tsx app/api/settings/verify-pin/route.ts
git commit -m "feat: PinGate with shake animation and 30s lockout after 3 fails"
```

---

## Task 20: Admin Shell + Page

**Files:**
- Create: `components/admin/AdminShell.tsx`
- Create: `app/admin/page.tsx`

- [ ] **Step 1: Create `components/admin/AdminShell.tsx`**

```tsx
'use client'
import { useState } from 'react'
import MembersTab from './MembersTab'
import ChoresTab from './ChoresTab'
import ScheduleTab from './ScheduleTab'
import PointsPayTab from './PointsPayTab'
import ChangePinTab from './ChangePinTab'

type Tab = 'members' | 'chores' | 'schedule' | 'points' | 'pin'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'members',  label: 'Members',      icon: '👨‍👩‍👧‍👦' },
  { id: 'chores',   label: 'Chores',       icon: '📋' },
  { id: 'schedule', label: 'Schedule',     icon: '🕐' },
  { id: 'points',   label: 'Points & Pay', icon: '💰' },
  { id: 'pin',      label: 'Change PIN',   icon: '🔒' },
]

export default function AdminShell() {
  const [tab, setTab] = useState<Tab>('members')

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Sidebar */}
      <div className="flex flex-col gap-1 p-3 flex-shrink-0 w-44"
        style={{ background: 'rgba(0,0,0,0.3)', borderRight: '1px solid rgba(255,255,255,0.07)' }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold text-left transition-colors"
            style={{
              background: tab === t.id ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: tab === t.id ? 'white' : 'rgba(255,255,255,0.5)',
            }}>
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {tab === 'members'  && <MembersTab />}
        {tab === 'chores'   && <ChoresTab />}
        {tab === 'schedule' && <ScheduleTab />}
        {tab === 'points'   && <PointsPayTab />}
        {tab === 'pin'      && <ChangePinTab />}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `app/admin/page.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PinGate from '@/components/PinGate'
import AdminShell from '@/components/admin/AdminShell'

export default function AdminPage() {
  const [unlocked, setUnlocked] = useState(false)
  const router = useRouter()

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden"
      style={{ background: '#0d0d1a' }}>
      {/* Top bar */}
      <div className="flex items-center px-4 py-2 flex-shrink-0"
        style={{ background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <button onClick={() => router.push('/')}
          className="px-3 py-1 rounded-xl text-sm font-bold text-white/50 mr-3"
          style={{ background: 'rgba(255,255,255,0.09)' }}>
          ← Back
        </button>
        <span className="text-lg text-white" style={{ fontFamily: 'var(--font-fredoka)' }}>
          ⚙ Admin
        </span>
      </div>

      {unlocked ? <AdminShell /> : <div className="flex-1" />}
      {!unlocked && <PinGate onSuccess={() => setUnlocked(true)} />}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/admin/AdminShell.tsx app/admin/page.tsx
git commit -m "feat: admin page with PIN gate and sidebar navigation"
```

---

## Task 21: Admin — MembersTab

**Files:**
- Create: `components/admin/MembersTab.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client'
import { useState } from 'react'
import { useMembers, type Member } from '@/hooks/useMembers'

export default function MembersTab() {
  const { members, mutate } = useMembers()
  const [editing, setEditing] = useState<Partial<Member> & { id?: number } | null>(null)

  const save = async () => {
    if (!editing) return
    const method = editing.id ? 'PUT' : 'POST'
    await fetch('/api/members', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    })
    mutate()
    setEditing(null)
  }

  const del = async (id: number) => {
    if (!confirm('Delete this member?')) return
    await fetch('/api/members', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    mutate()
  }

  const uploadPhoto = async (memberId: number, file: File) => {
    const fd = new FormData()
    fd.append('photo', file)
    fd.append('member_id', String(memberId))
    await fetch('/api/upload-photo', { method: 'POST', body: fd })
    mutate()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'var(--font-fredoka)' }}>Members</h2>
        <button
          onClick={() => setEditing({ name: '', age: 5, colour: '#6366f1', point_value_cents: 10 })}
          className="px-4 py-2 rounded-xl text-sm font-bold text-white"
          style={{ background: '#6366f1' }}>
          + Add Member
        </button>
      </div>

      {members.map((m) => (
        <div key={m.id} className="flex items-center gap-3 p-3 rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${m.colour}44` }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold"
            style={{ background: m.colour }}>
            {m.photo_path
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={m.photo_path} alt={m.name} className="w-full h-full rounded-full object-cover" />
              : <span className="text-white">{m.name[0]}</span>}
          </div>
          <div className="flex-1">
            <div className="font-bold text-white">{m.name}</div>
            <div className="text-xs text-white/50">Age {m.age} · ${(m.point_value_cents / 100).toFixed(2)}/pt</div>
          </div>
          <label className="px-2 py-1 rounded-lg text-xs font-bold text-white/60 cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.08)' }}>
            📷
            <input type="file" accept="image/*" className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadPhoto(m.id, e.target.files[0])} />
          </label>
          <button onClick={() => setEditing(m)}
            className="px-3 py-1 rounded-lg text-xs font-bold text-white/60"
            style={{ background: 'rgba(255,255,255,0.08)' }}>Edit</button>
          <button onClick={() => del(m.id)}
            className="px-3 py-1 rounded-lg text-xs font-bold text-red-400"
            style={{ background: 'rgba(239,68,68,0.1)' }}>Del</button>
        </div>
      ))}

      {editing && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50">
          <div className="flex flex-col gap-3 p-6 rounded-3xl w-80"
            style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 className="text-lg font-bold text-white">{editing.id ? 'Edit' : 'Add'} Member</h3>
            {[
              { label: 'Name', key: 'name', type: 'text' },
              { label: 'Age',  key: 'age',  type: 'number' },
            ].map(({ label, key, type }) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-xs text-white/50">{label}</label>
                <input type={type} value={(editing as any)[key] ?? ''}
                  onChange={(e) => setEditing((prev) => ({ ...prev, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-white/10 text-white outline-none border border-white/10" />
              </div>
            ))}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Colour</label>
              <input type="color" value={editing.colour ?? '#6366f1'}
                onChange={(e) => setEditing((p) => ({ ...p, colour: e.target.value }))}
                className="w-full h-10 rounded-xl cursor-pointer" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Cents per point (e.g. 10 = $0.10)</label>
              <input type="number" value={editing.point_value_cents ?? 10}
                onChange={(e) => setEditing((p) => ({ ...p, point_value_cents: Number(e.target.value) }))}
                className="px-3 py-2 rounded-xl bg-white/10 text-white outline-none border border-white/10" />
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => setEditing(null)}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white/50"
                style={{ background: 'rgba(255,255,255,0.08)' }}>Cancel</button>
              <button onClick={save}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white"
                style={{ background: '#6366f1' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/admin/MembersTab.tsx
git commit -m "feat: admin MembersTab with CRUD, colour picker, photo upload"
```

---

## Task 22: Admin — ChoresTab

**Files:**
- Create: `components/admin/ChoresTab.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { useMembers } from '@/hooks/useMembers'
import type { Chore } from '@/hooks/useChores'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type ChoreForm = {
  id?: number; name: string; points: number
  routine: 'morning' | 'afternoon' | 'both'; member_ids: number[]
}

export default function ChoresTab() {
  const { data: chores, mutate } = useSWR<Chore[]>('/api/chores', fetcher)
  const { members } = useMembers()
  const [editing, setEditing] = useState<ChoreForm | null>(null)

  const save = async () => {
    if (!editing) return
    const isNew = !editing.id
    await fetch('/api/chores', {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    })
    mutate()
    if (isNew) {
      // trigger image generation
      const updated = await fetch('/api/chores').then((r) => r.json()) as Chore[]
      const newest = updated[updated.length - 1]
      if (newest) {
        fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chore_id: newest.id, chore_name: newest.name }),
        })
      }
    }
    setEditing(null)
  }

  const del = async (id: number) => {
    if (!confirm('Delete this chore?')) return
    await fetch('/api/chores', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    mutate()
  }

  const retryImage = (c: Chore) => {
    fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chore_id: c.id, chore_name: c.name }),
    }).then(() => mutate())
  }

  const toggleMember = (mid: number) =>
    setEditing((prev) => {
      if (!prev) return prev
      const ids = prev.member_ids.includes(mid)
        ? prev.member_ids.filter((x) => x !== mid)
        : [...prev.member_ids, mid]
      return { ...prev, member_ids: ids }
    })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'var(--font-fredoka)' }}>Chores</h2>
        <button
          onClick={() => setEditing({ name: '', points: 1, routine: 'morning', member_ids: [] })}
          className="px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: '#6366f1' }}>
          + Add Chore
        </button>
      </div>

      {(chores ?? []).map((c) => (
        <div key={c.id} className="flex items-center gap-3 p-3 rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-white/10">
            {c.image_status === 'ready' && c.image_path
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={c.image_path} alt={c.name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-lg">
                  {c.image_status === 'failed' ? '⚠️' : '⏳'}
                </div>}
          </div>
          <div className="flex-1">
            <div className="font-bold text-white text-sm">{c.name}</div>
            <div className="text-xs text-white/50">{c.routine} · {c.points}pt</div>
          </div>
          {c.image_status === 'failed' && (
            <button onClick={() => retryImage(c)}
              className="px-2 py-1 rounded-lg text-xs font-bold text-yellow-400"
              style={{ background: 'rgba(234,179,8,0.1)' }}>Retry</button>
          )}
          <button onClick={() => setEditing({ id: c.id, name: c.name, points: c.points, routine: c.routine, member_ids: c.member_ids })}
            className="px-3 py-1 rounded-lg text-xs font-bold text-white/60"
            style={{ background: 'rgba(255,255,255,0.08)' }}>Edit</button>
          <button onClick={() => del(c.id)}
            className="px-3 py-1 rounded-lg text-xs font-bold text-red-400"
            style={{ background: 'rgba(239,68,68,0.1)' }}>Del</button>
        </div>
      ))}

      {editing && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50">
          <div className="flex flex-col gap-3 p-6 rounded-3xl w-80"
            style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 className="text-lg font-bold text-white">{editing.id ? 'Edit' : 'Add'} Chore</h3>
            <input type="text" placeholder="Chore name" value={editing.name}
              onChange={(e) => setEditing((p) => p && ({ ...p, name: e.target.value }))}
              className="px-3 py-2 rounded-xl bg-white/10 text-white outline-none border border-white/10" />
            <div className="flex gap-2">
              {(['morning','afternoon','both'] as const).map((r) => (
                <button key={r} onClick={() => setEditing((p) => p && ({ ...p, routine: r }))}
                  className="flex-1 py-2 rounded-xl text-xs font-bold capitalize"
                  style={{
                    background: editing.routine === r ? '#6366f1' : 'rgba(255,255,255,0.08)',
                    color: editing.routine === r ? 'white' : 'rgba(255,255,255,0.5)',
                  }}>
                  {r}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Points</label>
              <input type="number" min={1} value={editing.points}
                onChange={(e) => setEditing((p) => p && ({ ...p, points: Number(e.target.value) }))}
                className="px-3 py-2 rounded-xl bg-white/10 text-white outline-none border border-white/10" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Assign to</label>
              <div className="flex gap-2 flex-wrap">
                {members.map((m) => (
                  <button key={m.id} onClick={() => toggleMember(m.id)}
                    className="px-3 py-1 rounded-xl text-xs font-bold"
                    style={{
                      background: editing.member_ids.includes(m.id) ? m.colour : 'rgba(255,255,255,0.08)',
                      color: editing.member_ids.includes(m.id) ? 'white' : 'rgba(255,255,255,0.5)',
                    }}>
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => setEditing(null)}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white/50"
                style={{ background: 'rgba(255,255,255,0.08)' }}>Cancel</button>
              <button onClick={save}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white"
                style={{ background: '#6366f1' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/admin/ChoresTab.tsx
git commit -m "feat: admin ChoresTab with DALL-E trigger on create and retry on fail"
```

---

## Task 23: Admin — ScheduleTab

**Files:**
- Create: `components/admin/ScheduleTab.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client'
import { useState } from 'react'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function ScheduleTab() {
  const { data: settings, mutate } = useSWR('/api/settings', fetcher)
  const [form, setForm] = useState<Record<string,string> | null>(null)

  const current = form ?? settings ?? {}

  const save = async () => {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(current),
    })
    mutate()
    setForm(null)
  }

  const fields = [
    { key: 'morning_start_time',   label: 'Morning starts', icon: '☀️' },
    { key: 'afternoon_start_time', label: 'Afternoon starts', icon: '🌙' },
    { key: 'daily_reset_time',     label: 'Daily reset', icon: '🔄' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'var(--font-fredoka)' }}>Schedule</h2>
      {fields.map(({ key, label, icon }) => (
        <div key={key} className="flex flex-col gap-1">
          <label className="text-sm text-white/60 font-bold">{icon} {label}</label>
          <input
            type="time"
            value={current[key] ?? ''}
            onChange={(e) => setForm((f) => ({ ...(f ?? settings ?? {}), [key]: e.target.value }))}
            className="px-4 py-3 rounded-xl bg-white/10 text-white outline-none border border-white/10 text-lg w-40"
          />
        </div>
      ))}
      <div className="flex items-center gap-3 mt-2 p-4 rounded-2xl"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {fields.map(({ key, icon }, i) => (
          <div key={key} className="flex-1 text-center">
            <div className="text-2xl">{icon}</div>
            <div className="text-xs text-white/40 mt-1">{current[key] ?? '--:--'}</div>
          </div>
        ))}
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

- [ ] **Step 2: Commit**

```bash
git add components/admin/ScheduleTab.tsx
git commit -m "feat: admin ScheduleTab with time pickers"
```

---

## Task 24: Admin — PointsPayTab (with Completion Ratio)

**Files:**
- Create: `components/admin/PointsPayTab.tsx`

- [ ] **Step 1: Add completion ratio endpoint — create `app/api/completions/ratio/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// GET /api/completions/ratio?days=7
// Returns per-member completion rate for the last N days
export function GET(req: NextRequest) {
  const days = Number(new URL(req.url).searchParams.get('days') ?? '7')
  const db = getDb()

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const since = cutoff.toISOString().slice(0, 10)

  const members = db.prepare('SELECT id, name FROM members').all() as { id: number; name: string }[]

  const result = members.map((m) => {
    // Count unique (date, chore) combos that were completed
    const completed = (db.prepare(`
      SELECT COUNT(DISTINCT date || '-' || chore_id) as cnt
      FROM completions WHERE member_id=? AND date>=?
    `).get(m.id, since) as any).cnt as number

    // Count how many chore-days were possible (assigned chores × days)
    const assignedCount = (db.prepare(`
      SELECT COUNT(*) as cnt FROM chore_assignments WHERE member_id=?
    `).get(m.id) as any).cnt as number

    const possible = assignedCount * days
    const rate = possible > 0 ? Math.round((completed / possible) * 100) : 0

    return { member_id: m.id, name: m.name, completed, possible, rate }
  })

  return NextResponse.json(result)
}
```

- [ ] **Step 2: Implement `components/admin/PointsPayTab.tsx`**

```tsx
'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { useMembers } from '@/hooks/useMembers'
import { centsToDisplay } from '@/lib/points'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function PointsPayTab() {
  const { members } = useMembers()
  const [addForm, setAddForm] = useState<{ member_id: number; bucket: string; amount: string } | null>(null)
  const [ratioDays, setRatioDays] = useState(7)
  const { data: ratios } = useSWR(`/api/completions/ratio?days=${ratioDays}`, fetcher, { refreshInterval: 30000 })

  const getBalances = (memberId: number) =>
    useSWR(`/api/points?member_id=${memberId}`, fetcher)

  const payout = async (memberId: number) => {
    if (!confirm('Mark as paid? This will zero all balances.')) return
    await fetch('/api/points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'payout', member_id: memberId }),
    })
  }

  const adminAdd = async () => {
    if (!addForm) return
    await fetch('/api/points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'admin_add',
        member_id: addForm.member_id,
        bucket: addForm.bucket,
        amount_cents: Math.round(parseFloat(addForm.amount) * 100),
      }),
    })
    setAddForm(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'var(--font-fredoka)' }}>Points & Pay</h2>
      <p className="text-xs text-white/40">Kids choose their own Spend / Save / Give split.</p>

      {members.map((m) => (
        <MemberBalanceRow
          key={m.id} member={m}
          onPayout={() => payout(m.id)}
          onAdminAdd={() => setAddForm({ member_id: m.id, bucket: 'spend', amount: '' })}
        />
      ))}

      {/* Completion ratio */}
      <div className="mt-4">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="font-bold text-white">Completion Ratio</h3>
          {[7, 30].map((d) => (
            <button key={d} onClick={() => setRatioDays(d)}
              className="px-3 py-1 rounded-lg text-xs font-bold"
              style={{
                background: ratioDays === d ? '#6366f1' : 'rgba(255,255,255,0.08)',
                color: ratioDays === d ? 'white' : 'rgba(255,255,255,0.5)',
              }}>
              {d}d
            </button>
          ))}
        </div>
        {(ratios ?? []).map((r: any) => (
          <div key={r.member_id} className="flex items-center gap-3 mb-2">
            <div className="text-sm text-white/80 w-20">{r.name}</div>
            <div className="flex-1 h-3 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{ width: `${r.rate}%`, background: r.rate >= 80 ? '#4ade80' : r.rate >= 50 ? '#fb923c' : '#ef4444' }} />
            </div>
            <div className="text-xs text-white/50 w-10 text-right">{r.rate}%</div>
          </div>
        ))}
      </div>

      {/* Admin add modal */}
      {addForm && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50">
          <div className="flex flex-col gap-3 p-6 rounded-3xl w-72"
            style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 className="font-bold text-white">Manual Add</h3>
            <div className="flex gap-2">
              {['spend','save','give'].map((b) => (
                <button key={b} onClick={() => setAddForm((f) => f && ({ ...f, bucket: b }))}
                  className="flex-1 py-2 rounded-xl text-xs font-bold capitalize"
                  style={{
                    background: addForm.bucket === b ? '#6366f1' : 'rgba(255,255,255,0.08)',
                    color: addForm.bucket === b ? 'white' : 'rgba(255,255,255,0.5)',
                  }}>
                  {b}
                </button>
              ))}
            </div>
            <input type="number" step="0.01" placeholder="Amount ($)"
              value={addForm.amount}
              onChange={(e) => setAddForm((f) => f && ({ ...f, amount: e.target.value }))}
              className="px-3 py-2 rounded-xl bg-white/10 text-white outline-none border border-white/10" />
            <div className="flex gap-2 mt-1">
              <button onClick={() => setAddForm(null)}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white/50"
                style={{ background: 'rgba(255,255,255,0.08)' }}>Cancel</button>
              <button onClick={adminAdd}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white"
                style={{ background: '#6366f1' }}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MemberBalanceRow({
  member, onPayout, onAdminAdd,
}: { member: any; onPayout: () => void; onAdminAdd: () => void }) {
  const { data } = useSWR(`/api/points?member_id=${member.id}`,
    (url: string) => fetch(url).then((r) => r.json()), { refreshInterval: 5000 })
  const get = (b: string) => (data ?? []).find((x: any) => x.bucket === b)?.balance_cents ?? 0

  return (
    <div className="p-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${member.colour}33` }}>
      <div className="flex items-center justify-between mb-3">
        <span className="font-bold text-white" style={{ color: member.colour }}>{member.name}</span>
        <div className="flex gap-2">
          <button onClick={onAdminAdd}
            className="px-3 py-1 rounded-lg text-xs font-bold text-white/60"
            style={{ background: 'rgba(255,255,255,0.08)' }}>+ Add</button>
          <button onClick={onPayout}
            className="px-3 py-1 rounded-lg text-xs font-bold text-green-400"
            style={{ background: 'rgba(74,222,128,0.1)' }}>Mark Paid</button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        {[['unallocated','🎯','#a78bfa'],['spend','🛍️','#fb923c'],['save','🏦','#60a5fa'],['give','🤝','#4ade80']].map(([b,icon,col]) => (
          <div key={b}>
            <div className="text-base">{icon}</div>
            <div className="font-bold" style={{ color: col as string }}>{centsToDisplay(get(b as string))}</div>
            <div className="text-white/40 capitalize">{b}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/admin/PointsPayTab.tsx app/api/completions/ratio/route.ts
git commit -m "feat: admin PointsPayTab with manual add, payout, and completion ratio"
```

---

## Task 25: Admin — ChangePinTab

**Files:**
- Create: `components/admin/ChangePinTab.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client'
import { useState } from 'react'

type Step = 'verify' | 'new' | 'confirm'

export default function ChangePinTab() {
  const [step, setStep] = useState<Step>('verify')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleVerify = async () => {
    const res = await fetch('/api/settings/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: current }),
    })
    const { ok } = await res.json()
    if (ok) { setError(''); setStep('new') }
    else setError('Incorrect PIN')
  }

  const handleConfirm = async (confirmPin: string) => {
    if (confirmPin !== next) { setError('PINs do not match'); return }
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'change_pin', current_pin: current, new_pin: next }),
    })
    setSuccess(true)
    setCurrent(''); setNext(''); setStep('verify')
  }

  if (success) return (
    <div className="flex flex-col items-center gap-4 mt-8">
      <div className="text-4xl">✅</div>
      <div className="text-white font-bold">PIN changed successfully</div>
      <button onClick={() => setSuccess(false)}
        className="px-4 py-2 rounded-xl text-sm font-bold text-white"
        style={{ background: '#6366f1' }}>Done</button>
    </div>
  )

  return (
    <div className="flex flex-col gap-6 max-w-xs">
      <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'var(--font-fredoka)' }}>Change PIN</h2>

      {/* Progress */}
      <div className="flex gap-2">
        {(['verify','new','confirm'] as Step[]).map((s, i) => (
          <div key={s} className="flex-1 h-1.5 rounded-full transition-colors"
            style={{ background: (['verify','new','confirm'].indexOf(step) >= i) ? '#6366f1' : 'rgba(255,255,255,0.1)' }} />
        ))}
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}

      {step === 'verify' && (
        <PinInput label="Current PIN" onComplete={handleVerify} onChange={setCurrent} />
      )}
      {step === 'new' && (
        <PinInput label="New PIN (4 digits)" onComplete={() => setStep('confirm')} onChange={setNext} />
      )}
      {step === 'confirm' && (
        <PinInput label="Confirm new PIN" onComplete={handleConfirm} onChange={() => {}} />
      )}
    </div>
  )
}

function PinInput({ label, onComplete, onChange }: {
  label: string; onComplete: (pin: string) => void; onChange: (pin: string) => void
}) {
  const [pin, setPin] = useState('')
  const digits = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  const press = (d: string) => {
    if (d === '⌫') {
      const p = pin.slice(0,-1); setPin(p); onChange(p)
    } else if (d && pin.length < 4) {
      const p = pin + d; setPin(p); onChange(p)
      if (p.length === 4) onComplete(p)
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-sm text-white/50">{label}</div>
      <div className="flex gap-3">
        {[0,1,2,3].map((i) => (
          <div key={i} className="w-5 h-5 rounded-full border-2 border-white/40"
            style={{ background: pin.length > i ? 'white' : 'transparent' }} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {digits.map((d, i) => (
          <button key={i} onClick={() => press(d)} disabled={!d && d !== '⌫'}
            className="w-14 h-14 rounded-2xl text-xl font-bold text-white active:scale-95 transition-transform"
            style={{ background: d ? 'rgba(255,255,255,0.1)' : 'transparent' }}>
            {d}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/admin/ChangePinTab.tsx
git commit -m "feat: admin ChangePinTab with 3-step PIN change flow"
```

---

## Task 26: Streak Counter

The streak counter increments when a member completes **all** of their routine chores for the day and resets to 0 if they miss a day. It runs server-side in the scheduler.

**Files:**
- Modify: `lib/scheduler.ts`
- Create: `app/api/completions/check-streak/route.ts`

- [ ] **Step 1: Add streak check API endpoint**

```ts
// app/api/completions/check-streak/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// POST { member_id } — called after each completion
// Checks if all chores for today's routine are done; if so, updates streak
export async function POST(req: NextRequest) {
  const { member_id } = await req.json()
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)

  // Determine current routine based on afternoon_start_time
  const afternoonTime = (db.prepare("SELECT value FROM settings WHERE key='afternoon_start_time'").get() as any)?.value ?? '12:00'
  const [ah, am] = afternoonTime.split(':').map(Number)
  const now = new Date()
  const routine = now.getHours() * 60 + now.getMinutes() >= ah * 60 + am ? 'afternoon' : 'morning'

  // Get all assigned chores for this member + routine
  const assigned = db.prepare(`
    SELECT c.id FROM chores c
    JOIN chore_assignments ca ON ca.chore_id=c.id
    WHERE ca.member_id=? AND (c.routine=? OR c.routine='both')
  `).all(member_id, routine) as { id: number }[]

  if (assigned.length === 0) return NextResponse.json({ streak_updated: false })

  const completedToday = db.prepare(
    'SELECT chore_id FROM completions WHERE member_id=? AND date=?'
  ).all(member_id, today) as { chore_id: number }[]

  const completedIds = new Set(completedToday.map((c) => c.chore_id))
  const allDone = assigned.every((a) => completedIds.has(a.id))

  if (!allDone) return NextResponse.json({ streak_updated: false, all_done: false })

  // Check if streak was already updated today
  const member = db.prepare('SELECT streak_days, last_streak_date FROM members WHERE id=?')
    .get(member_id) as { streak_days: number; last_streak_date: string | null }

  if (member.last_streak_date === today) return NextResponse.json({ streak_updated: false, reason: 'already_updated' })

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)
  const isConsecutive = member.last_streak_date === yesterdayStr

  const newStreak = isConsecutive ? member.streak_days + 1 : 1
  db.prepare('UPDATE members SET streak_days=?, last_streak_date=? WHERE id=?')
    .run(newStreak, today, member_id)

  return NextResponse.json({ streak_updated: true, streak_days: newStreak, all_done: true })
}
```

- [ ] **Step 2: Call streak check from `app/page.tsx` after each completion toggle**

In `app/page.tsx`, update `handleToggle` to call the streak check after a completion (not uncomplete):

```tsx
const handleToggle = async (choreId: number) => {
  if (!activeMemberId) return
  const isCompleted = completedIds.has(choreId)
  await fetch('/api/completions', {
    method: isCompleted ? 'DELETE' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chore_id: choreId, member_id: activeMemberId }),
  })
  if (!isCompleted) {
    // Check if all chores done → update streak + trigger celebration
    const res = await fetch('/api/completions/check-streak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: activeMemberId }),
    })
    const { all_done } = await res.json()
    if (all_done) triggerCelebration()
  }
  mutateCompletions()
  points.mutate()
}
```

Add `triggerCelebration` above the return:

```tsx
const triggerCelebration = async () => {
  const { default: confetti } = await import('canvas-confetti')
  confetti({ particleCount: 200, spread: 120, origin: { y: 0.5 } })
}
```

- [ ] **Step 3: Reset streaks for missed days in daily scheduler**

In `lib/scheduler.ts`, add a streak reset inside the daily reset cron job:

```ts
// Add inside the daily reset cron callback, after the completions delete:
// Reset streak_days to 0 for any member who didn't complete all chores yesterday
const members = db.prepare('SELECT id, last_streak_date FROM members').all() as {
  id: number; last_streak_date: string | null
}[]
for (const m of members) {
  if (m.last_streak_date !== yesterday) {
    db.prepare('UPDATE members SET streak_days=0 WHERE id=?').run(m.id)
  }
}
```

The full updated `startScheduler` function:

```ts
export function startScheduler() {
  cron.schedule('* * * * *', () => {
    const resetTime = getSetting('daily_reset_time') || '00:00'
    const [hh, mm] = resetTime.split(':').map(Number)
    const now = new Date()
    if (now.getHours() === hh && now.getMinutes() === mm) {
      const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10)
      const db = getDb()
      db.prepare('DELETE FROM completions WHERE date = ?').run(yesterday)

      // Reset streaks for members who missed yesterday
      const members = db.prepare('SELECT id, last_streak_date FROM members').all() as {
        id: number; last_streak_date: string | null
      }[]
      for (const m of members) {
        if (m.last_streak_date !== yesterday) {
          db.prepare('UPDATE members SET streak_days=0 WHERE id=?').run(m.id)
        }
      }
      console.log(`[scheduler] Daily reset + streak check complete for ${yesterday}`)
    }
  })
  console.log('[scheduler] Started')
}
```

- [ ] **Step 4: Verify streak behaviour manually**

```bash
# Complete all chores for member 1, then check streak
curl -X POST http://localhost:3000/api/completions/check-streak \
  -H 'Content-Type: application/json' \
  -d '{"member_id":1}'
# Expected: {"streak_updated":true,"streak_days":1,"all_done":true}

# Check member record
curl http://localhost:3000/api/members
# Expected: member.streak_days = 1
```

- [ ] **Step 5: Commit**

```bash
git add app/api/completions/check-streak/route.ts lib/scheduler.ts app/page.tsx
git commit -m "feat: streak counter + all-chores completion celebration"
```

---

## Task 27: Raspberry Pi Deployment

**Files:**
- Create: `scripts/setup-pi.sh`
- Create: `scripts/chore-app.service` (systemd unit file)
- Create: `.env.production`

- [ ] **Step 1: Create production build script `scripts/setup-pi.sh`**

```bash
#!/bin/bash
set -e

echo "=== Family Chore App — Pi Setup ==="

# 1. Install Node.js 20 if not present
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# 2. Install dependencies and build
npm ci
npm run build

# 3. Create data directory
mkdir -p data

echo "=== Build complete. Run: npm start ==="
```

- [ ] **Step 2: Create systemd service `scripts/chore-app.service`**

```ini
[Unit]
Description=Family Chore App
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/family-chore-app
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 3: Create Chromium kiosk autostart**

Create `/home/pi/.config/autostart/kiosk.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=Chore App Kiosk
Exec=bash -c "sleep 10 && chromium-browser --noerrdialogs --disable-infobars --kiosk http://localhost:3000"
Hidden=false
X-GNOME-Autostart-enabled=true
```

- [ ] **Step 4: Deploy steps**

Run these on the Raspberry Pi:

```bash
# Copy the app to the Pi (from dev machine)
rsync -avz --exclude node_modules --exclude .git \
  . pi@raspberrypi.local:/home/pi/family-chore-app/

# On the Pi:
ssh pi@raspberrypi.local
cd /home/pi/family-chore-app
cp .env.local .env.production.local   # copy your OPENAI_API_KEY
bash scripts/setup-pi.sh

# Install and start systemd service
sudo cp scripts/chore-app.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable chore-app
sudo systemctl start chore-app

# Check status
sudo systemctl status chore-app
```

- [ ] **Step 5: Verify**

```bash
# On Pi — check app is running
curl http://localhost:3000/api/members
# Expected: [] (empty array)

# Check Chromium launches on reboot
sudo reboot
# Expected: Chromium opens full-screen to http://localhost:3000 after ~15 seconds
```

- [ ] **Step 6: Commit**

```bash
git add scripts/
git commit -m "feat: Raspberry Pi deployment scripts and systemd service"
```

---

## Task 28: Jest Configuration

**Files:**
- Modify: `package.json` (add jest config)
- Create: `jest.config.ts`
- Create: `jest.setup.ts`

- [ ] **Step 1: Install Jest deps**

```bash
npm install -D jest ts-jest @types/jest jest-environment-node
```

- [ ] **Step 2: Create `jest.config.ts`**

```ts
import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathPattern: ['lib/__tests__'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  setupFilesAfterFramework: ['./jest.setup.ts'],
}

export default config
```

- [ ] **Step 3: Create `jest.setup.ts`**

```ts
// Use an in-memory DB for tests
process.env.DB_PATH = ':memory:'
```

- [ ] **Step 4: Add test script to `package.json`**

```json
"scripts": {
  "test": "jest",
  "test:watch": "jest --watch"
}
```

- [ ] **Step 5: Run all tests**

```bash
npm test
```
Expected: All tests in `lib/__tests__/` PASS (db, auth, grid, points — ~10 tests total).

- [ ] **Step 6: Commit**

```bash
git add jest.config.ts jest.setup.ts package.json package-lock.json
git commit -m "feat: Jest + ts-jest configuration with in-memory SQLite for tests"
```

---

## Self-Review Checklist

### Spec coverage check

| Spec requirement | Task |
|---|---|
| Toggle between family members with colour theming | Task 13, 17 |
| AI-generated chore images (DALL-E 3) | Task 10, 22 |
| Chore grid, all above fold, 4–15 chores | Task 4, 15 |
| Mark chores complete / incomplete | Task 9, 17 |
| Daily reset at configurable time | Task 6 |
| Morning / afternoon auto-switch | Task 12 (useRoutine), 17 |
| Points worth real dollars | Task 2 (point_value_cents), 9 |
| Cash-in: Spend / Save / Give allocation | Task 18 |
| Admin PIN gate (4-digit, shake, lockout) | Task 19 |
| Admin: Members CRUD + photo + colour | Task 21 |
| Admin: Chores CRUD + image status + retry | Task 22 |
| Admin: Schedule (times) | Task 23 |
| Admin: Points & Pay + manual add + mark paid | Task 24 |
| Admin: Change PIN (3-step) | Task 25 |
| Streak counter | Task 26 |
| Completion celebration (confetti) | Task 26 |
| When-Then framing | Task 17 |
| Completion ratio in admin | Task 24 |
| Raspberry Pi systemd deployment | Task 27 |
| SQLite local database | Task 2 |
| Fredoka One + Nunito fonts | Task 11 |

All spec requirements are covered. ✓

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-04-26-family-chore-app.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks

**2. Inline Execution** — execute tasks in this session using executing-plans skill

Which approach?
