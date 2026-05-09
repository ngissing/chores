# Per-Member Chore Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate unique DALL-E images per family member for each chore, using a rich base prompt plus a per-member appearance description stored in admin settings.

**Architecture:** A new `chore_member_images` table stores one image per (chore, member) pair. The existing `chores.image_path`/`image_status` columns are left untouched for backward compat. The chores API gains a `?member_id` param that returns member-specific images; without it, it returns aggregate status for the admin view. Image generation fires once per assigned member when a chore is created.

**Tech Stack:** Next.js 14 App Router, SQLite via better-sqlite3, OpenAI DALL-E 3, SWR, TypeScript, Tailwind CSS.

---

## File Map

| File | Change |
|---|---|
| `src/lib/db.ts` | Add `chore_member_images` table + `appearance` column migration |
| `src/lib/__tests__/db.test.ts` | Add tests for new table and column |
| `src/app/api/members/route.ts` | Include `appearance` in GET/POST/PUT |
| `src/hooks/useMembers.ts` | Add `appearance: string` to `Member` interface |
| `src/components/admin/MembersTab.tsx` | Add appearance textarea to Add/Edit modal |
| `src/app/api/generate-image/route.ts` | Rewrite: accept `member_id`, build full prompt, write to `chore_member_images` |
| `src/app/api/chores/route.ts` | `GET` accepts `?member_id`, JOINs `chore_member_images` |
| `src/hooks/useChores.ts` | Pass `memberId` as query param to `/api/chores` |
| `src/components/admin/ChoresTab.tsx` | Fire per-member generation on create; retry all members on fail |

---

## Task 1: DB Schema — `appearance` column + `chore_member_images` table

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/lib/__tests__/db.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/lib/__tests__/db.test.ts`:

```ts
test('members table has appearance column', () => {
  const db = getDb()
  const info = db.prepare('PRAGMA table_info(members)').all() as { name: string }[]
  expect(info.map((c) => c.name)).toContain('appearance')
})

test('chore_member_images table exists', () => {
  const db = getDb()
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r: { name: string }) => r.name)
  expect(tables).toContain('chore_member_images')
})

test('chore_member_images has correct columns', () => {
  const db = getDb()
  const info = db.prepare('PRAGMA table_info(chore_member_images)').all() as { name: string }[]
  const cols = info.map((c) => c.name)
  expect(cols).toContain('chore_id')
  expect(cols).toContain('member_id')
  expect(cols).toContain('image_path')
  expect(cols).toContain('image_status')
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "C:\Users\Nick Gissing\Claude Code" && npx jest src/lib/__tests__/db.test.ts --no-coverage 2>&1
```
Expected: 3 new tests FAIL (`appearance`, `chore_member_images` table, columns)

- [ ] **Step 3: Implement schema changes in `src/lib/db.ts`**

Add inside `initSchema`, after the `db.exec(...)` block and before the settings seed:

```ts
  // Migration: add appearance column to members (idempotent)
  try {
    db.exec(`ALTER TABLE members ADD COLUMN appearance TEXT NOT NULL DEFAULT ''`)
  } catch {
    // Column already exists — safe to ignore
  }

  // Per-member chore images
  db.exec(`
    CREATE TABLE IF NOT EXISTS chore_member_images (
      chore_id     INTEGER NOT NULL,
      member_id    INTEGER NOT NULL,
      image_path   TEXT,
      image_status TEXT NOT NULL DEFAULT 'pending',
      PRIMARY KEY (chore_id, member_id),
      FOREIGN KEY (chore_id)  REFERENCES chores(id)  ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    )
  `)
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd "C:\Users\Nick Gissing\Claude Code" && npx jest src/lib/__tests__/db.test.ts --no-coverage 2>&1
```
Expected: all tests PASS (5 total now)

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\Nick Gissing\Claude Code" && git add src/lib/db.ts src/lib/__tests__/db.test.ts && git commit -m "feat: add chore_member_images table and members.appearance column"
```

---

## Task 2: Members API + Hook + MembersTab — appearance field

**Files:**
- Modify: `src/app/api/members/route.ts`
- Modify: `src/hooks/useMembers.ts`
- Modify: `src/components/admin/MembersTab.tsx`

- [ ] **Step 1: Update `src/app/api/members/route.ts`**

Replace the entire file:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

export function GET() {
  const members = getDb().prepare('SELECT * FROM members ORDER BY id').all()
  return NextResponse.json(members)
}

export async function POST(req: NextRequest) {
  const { name, age, colour, point_value_cents, appearance } = await req.json()
  const db = getDb()
  const result = db
    .prepare('INSERT INTO members (name, age, colour, point_value_cents, appearance) VALUES (?, ?, ?, ?, ?)')
    .run(name, age, colour ?? '#6366f1', point_value_cents ?? 10, appearance ?? '')

  const memberId = result.lastInsertRowid as number

  const ins = db.prepare(
    'INSERT INTO point_balances (member_id, bucket, balance_cents) VALUES (?, ?, 0)'
  )
  for (const bucket of ['unallocated', 'spend', 'save', 'give']) {
    ins.run(memberId, bucket)
  }

  return NextResponse.json({ id: memberId }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const { id, name, age, colour, point_value_cents, appearance } = await req.json()
  getDb()
    .prepare('UPDATE members SET name=?, age=?, colour=?, point_value_cents=?, appearance=? WHERE id=?')
    .run(name, age, colour, point_value_cents, appearance ?? '', id)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  getDb().prepare('DELETE FROM members WHERE id=?').run(id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Update `src/hooks/useMembers.ts`**

Add `appearance: string` to the `Member` interface:

```ts
'use client'
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
  appearance: string
}

export function useMembers() {
  const { data, error, mutate } = useSWR<Member[]>('/api/members', fetcher)
  return { members: data ?? [], loading: !data && !error, mutate }
}
```

- [ ] **Step 3: Update `src/components/admin/MembersTab.tsx` — add appearance textarea**

In the modal, add a textarea below the colour picker (before the cents-per-point field):

```tsx
<div className="flex flex-col gap-1">
  <label className="text-xs text-white/50">Appearance description</label>
  <textarea
    placeholder="e.g. blonde hair, blue eyes, wears a red shirt"
    value={editing.appearance ?? ''}
    onChange={(e) => setEditing((p) => ({ ...p, appearance: e.target.value }))}
    rows={2}
    className="px-3 py-2 rounded-xl bg-white/10 text-white outline-none border border-white/10 resize-none text-sm"
  />
</div>
```

Insert it between the colour picker block and the cents-per-point block. The full modal order becomes: Name → Age → Colour → Appearance → Cents per point → Cancel/Save.

Also update the "+ Add Member" default state to include `appearance`:

```tsx
onClick={() => setEditing({ name: '', age: 5, colour: '#6366f1', point_value_cents: 10, appearance: '' })}
```

- [ ] **Step 4: Build check**

```bash
cd "C:\Users\Nick Gissing\Claude Code" && npm run build 2>&1 | tail -10
```
Expected: `✓ Compiled successfully`

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\Nick Gissing\Claude Code" && git add src/app/api/members/route.ts src/hooks/useMembers.ts src/components/admin/MembersTab.tsx && git commit -m "feat: appearance field on members — API, hook, admin UI"
```

---

## Task 3: Generate-Image Route — base prompt + per-member images

**Files:**
- Modify: `src/app/api/generate-image/route.ts`

- [ ] **Step 1: Replace `src/app/api/generate-image/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import OpenAI from 'openai'
import https from 'https'
import fs from 'fs'
import path from 'path'

const BASE_PROMPT = `Create a kid-friendly chore-card style illustration on a pure white background. Use a clean, cheerful children's picture-book/vector cartoon style with simple shapes, soft pastel colours, bold but gentle outlines, smooth shading, and minimal clutter.

The character should have big expressive eyes, rosy cheeks, and a happy smile completing a simple household chore. Keep the character consistent across images for specific users.

The action should be obvious at a glance and clearly show what chore needs to be completed. Use only the essential objects needed to communicate the task. Keep the composition centred, uncluttered, polished, and suitable for a children's chores chart.`

function buildPrompt(choreName: string, appearance: string): string {
  const parts = [BASE_PROMPT]
  if (appearance.trim()) {
    parts.push(
      `The character should look like: ${appearance.trim()}. Keep this character consistent across all chore images for this child.`
    )
  }
  parts.push(`The chore being completed is: ${choreName}.`)
  return parts.join('\n\n')
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    https.get(url, (res) => {
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
    }).on('error', reject)
  })
}

export async function POST(req: NextRequest) {
  const { chore_id, chore_name, member_id } = await req.json()
  const db = getDb()

  // Mark pending (upsert so retries work)
  db.prepare(`
    INSERT INTO chore_member_images (chore_id, member_id, image_status)
    VALUES (?, ?, 'pending')
    ON CONFLICT (chore_id, member_id) DO UPDATE SET image_status = 'pending', image_path = NULL
  `).run(chore_id, member_id)

  try {
    const member = db.prepare('SELECT appearance FROM members WHERE id=?')
      .get(member_id) as { appearance: string } | undefined
    const appearance = member?.appearance ?? ''

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const prompt = buildPrompt(chore_name, appearance)

    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
    })

    const imageUrl = response.data?.[0]?.url
    if (!imageUrl) throw new Error('No image URL returned from OpenAI')

    const filename = `${chore_id}_${member_id}.png`
    const destPath = path.join(process.cwd(), 'public', 'chore-images', filename)
    await downloadFile(imageUrl, destPath)

    db.prepare(`
      UPDATE chore_member_images SET image_path = ?, image_status = 'ready'
      WHERE chore_id = ? AND member_id = ?
    `).run(`/chore-images/${filename}`, chore_id, member_id)

    return NextResponse.json({ ok: true, image_path: `/chore-images/${filename}` })
  } catch (err: unknown) {
    db.prepare(`
      UPDATE chore_member_images SET image_status = 'failed'
      WHERE chore_id = ? AND member_id = ?
    `).run(chore_id, member_id)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Build check**

```bash
cd "C:\Users\Nick Gissing\Claude Code" && npm run build 2>&1 | tail -10
```
Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
cd "C:\Users\Nick Gissing\Claude Code" && git add src/app/api/generate-image/route.ts && git commit -m "feat: generate-image uses base prompt + member appearance, writes to chore_member_images"
```

---

## Task 4: Chores API — `?member_id` param and aggregate status

**Files:**
- Modify: `src/app/api/chores/route.ts`

- [ ] **Step 1: Replace `src/app/api/chores/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

interface ChoreRow {
  id: number
  name: string
  image_path: string | null
  image_status: string
  points: number
  routine: string
  created_at: string
}

interface MemberImageRow {
  chore_id: number
  member_id: number
  image_path: string | null
  image_status: string
}

export function GET(req: NextRequest) {
  const db = getDb()
  const memberIdParam = new URL(req.url).searchParams.get('member_id')

  const chores = db.prepare('SELECT * FROM chores ORDER BY id').all() as ChoreRow[]
  const assignments = db.prepare('SELECT * FROM chore_assignments').all() as {
    chore_id: number
    member_id: number
  }[]

  const byChore: Record<number, number[]> = {}
  for (const a of assignments) {
    if (!byChore[a.chore_id]) byChore[a.chore_id] = []
    byChore[a.chore_id].push(a.member_id)
  }

  if (memberIdParam) {
    // Member view: return per-member image from chore_member_images
    const mid = Number(memberIdParam)
    const images = db.prepare(
      'SELECT chore_id, image_path, image_status FROM chore_member_images WHERE member_id = ?'
    ).all(mid) as MemberImageRow[]

    const imageByChore = new Map(images.map((i) => [i.chore_id, i]))

    const result = chores.map((c) => {
      const img = imageByChore.get(c.id)
      return {
        ...c,
        member_ids: byChore[c.id] ?? [],
        // Use member-specific image if available, otherwise fall back to legacy chore-level image
        image_path: img ? img.image_path : c.image_path,
        image_status: img ? img.image_status : c.image_status,
      }
    })
    return NextResponse.json(result)
  }

  // Admin view: aggregate image status from chore_member_images
  const allImages = db.prepare(
    'SELECT chore_id, image_path, image_status FROM chore_member_images'
  ).all() as MemberImageRow[]

  const imagesByChore: Record<number, MemberImageRow[]> = {}
  for (const img of allImages) {
    if (!imagesByChore[img.chore_id]) imagesByChore[img.chore_id] = []
    imagesByChore[img.chore_id].push(img)
  }

  const result = chores.map((c) => {
    const imgs = imagesByChore[c.id]
    if (!imgs || imgs.length === 0) {
      // No per-member images yet — use legacy chore-level columns
      return { ...c, member_ids: byChore[c.id] ?? [] }
    }
    // Aggregate: pending beats failed beats ready
    let aggStatus = 'ready'
    let previewPath: string | null = null
    for (const img of imgs) {
      if (img.image_status === 'pending') { aggStatus = 'pending'; break }
      if (img.image_status === 'failed') aggStatus = 'failed'
      if (img.image_status === 'ready' && !previewPath) previewPath = img.image_path
    }
    return {
      ...c,
      member_ids: byChore[c.id] ?? [],
      image_path: previewPath,
      image_status: aggStatus,
    }
  })
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const { name, points, routine, member_ids } = await req.json()
  const db = getDb()
  const { lastInsertRowid } = db
    .prepare('INSERT INTO chores (name, points, routine, image_status) VALUES (?, ?, ?, ?)')
    .run(name, points ?? 1, routine ?? 'morning', 'pending')

  const choreId = lastInsertRowid as number
  const ins = db.prepare('INSERT INTO chore_assignments (chore_id, member_id) VALUES (?, ?)')
  for (const mid of member_ids ?? []) ins.run(choreId, mid)

  return NextResponse.json({ id: choreId, name }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const { id, name, points, routine, member_ids, image_status, image_path } = await req.json()
  const db = getDb()
  db.prepare(
    `UPDATE chores SET name=?, points=?, routine=?,
      image_status=COALESCE(?, image_status),
      image_path=COALESCE(?, image_path)
    WHERE id=?`
  ).run(name, points, routine, image_status ?? null, image_path ?? null, id)

  if (member_ids !== undefined) {
    db.prepare('DELETE FROM chore_assignments WHERE chore_id=?').run(id)
    const ins = db.prepare('INSERT INTO chore_assignments (chore_id, member_id) VALUES (?, ?)')
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

Note: The POST now returns `{ id, name }` so ChoresTab can use `created.name` when firing image generation.

- [ ] **Step 2: Build check**

```bash
cd "C:\Users\Nick Gissing\Claude Code" && npm run build 2>&1 | tail -10
```
Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
cd "C:\Users\Nick Gissing\Claude Code" && git add src/app/api/chores/route.ts && git commit -m "feat: chores GET accepts ?member_id for per-member images, admin gets aggregate status"
```

---

## Task 5: `useChores` hook — pass `memberId` to API

**Files:**
- Modify: `src/hooks/useChores.ts`

- [ ] **Step 1: Replace `src/hooks/useChores.ts`**

```ts
'use client'
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

  const chores = (allChores ?? []).filter(
    (c) =>
      memberId !== null &&
      c.member_ids.includes(memberId) &&
      (c.routine === routine || c.routine === 'both')
  )

  const completedIds = new Set((completions ?? []).map((c) => c.chore_id))

  return { chores, completedIds, mutateChores, mutateCompletions }
}
```

- [ ] **Step 2: Build check**

```bash
cd "C:\Users\Nick Gissing\Claude Code" && npm run build 2>&1 | tail -10
```
Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
cd "C:\Users\Nick Gissing\Claude Code" && git add src/hooks/useChores.ts && git commit -m "feat: useChores passes memberId to /api/chores for per-member images"
```

---

## Task 6: ChoresTab — per-member image generation and retry

**Files:**
- Modify: `src/components/admin/ChoresTab.tsx`

- [ ] **Step 1: Update `save` function — fire per-member generation**

Replace the `save` function in `src/components/admin/ChoresTab.tsx`:

```ts
const save = async () => {
  if (!editing) return
  const isNew = !editing.id
  const res = await fetch('/api/chores', {
    method: isNew ? 'POST' : 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(editing),
  })
  mutate()
  if (isNew) {
    const created = await res.json() as { id: number; name: string }
    if (created?.id && editing.member_ids.length > 0) {
      // Fire one image generation per assigned member (parallel, fire-and-forget)
      for (const mid of editing.member_ids) {
        fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chore_id: created.id, chore_name: created.name, member_id: mid }),
        })
      }
    }
  }
  setEditing(null)
}
```

- [ ] **Step 2: Update `retryImage` — retry all assigned members**

Replace the `retryImage` function:

```ts
const retryImage = (c: Chore) => {
  for (const mid of c.member_ids) {
    fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chore_id: c.id, chore_name: c.name, member_id: mid }),
    })
  }
  setTimeout(() => mutate(), 500)
}
```

- [ ] **Step 3: Build check**

```bash
cd "C:\Users\Nick Gissing\Claude Code" && npm run build 2>&1 | tail -10
```
Expected: `✓ Compiled successfully`

- [ ] **Step 4: Run all tests**

```bash
cd "C:\Users\Nick Gissing\Claude Code" && npm test 2>&1
```
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\Nick Gissing\Claude Code" && git add src/components/admin/ChoresTab.tsx && git commit -m "feat: ChoresTab fires per-member image generation, retry regenerates all members"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✓ `chore_member_images` table — Task 1
- ✓ `members.appearance` column + migration — Task 1
- ✓ appearance in members API GET/POST/PUT — Task 2
- ✓ appearance textarea in MembersTab — Task 2
- ✓ Base prompt constant + appearance appended — Task 3
- ✓ Writes to `chore_member_images` not `chores` — Task 3
- ✓ `GET /api/chores?member_id` returns per-member image — Task 4
- ✓ `GET /api/chores` (no param) returns aggregate — Task 4
- ✓ Backward compat: falls back to `chores.image_path` if no per-member entry — Task 4
- ✓ `useChores` passes `memberId` to API — Task 5
- ✓ ChoresTab fires per-member on create — Task 6
- ✓ Retry fires for all assigned members — Task 6

**Type consistency:** `{ id: number; name: string }` returned from POST chores, used in ChoresTab save — consistent across Tasks 4 and 6.
