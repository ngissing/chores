# Gold Chores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Gold Chores — special one-off chores that appear at the end of the chore grid, require a parent PIN to award, and credit the selected child's unallocated points balance.

**Architecture:** Gold chores live in a new `gold_chores` SQLite table. They are fetched independently from regular chores and rendered as gold-styled cards at the end of `ChoreGrid`. Tapping a gold card shows `GoldApprovalOverlay` — a fullscreen PIN pad with member selector — which calls `/api/gold-chores/[id]/award` to verify the PIN server-side and credit points. The admin panel gets a new "Gold" tab for creating and managing gold chores.

**Tech Stack:** Next.js 14 App Router, TypeScript, better-sqlite3, SWR, Tailwind, `@google/genai` (nano-banana-pro-preview), bcryptjs, canvas-confetti

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/lib/db.ts` | Modify | Add `gold_chores` table to schema |
| `src/lib/__tests__/db.test.ts` | Modify | Tests for gold_chores table |
| `src/app/api/gold-chore-image/[filename]/route.ts` | Create | Serve gold chore images from disk |
| `src/app/api/generate-gold-image/route.ts` | Create | Generate AI image (no person) for a gold chore |
| `src/app/api/gold-chores/route.ts` | Create | GET list + POST create |
| `src/app/api/gold-chores/[id]/route.ts` | Create | DELETE |
| `src/app/api/gold-chores/[id]/award/route.ts` | Create | POST verify PIN + award to member |
| ~~`src/app/api/gold-chores/[id]/regenerate/route.ts`~~ | Removed | GoldTab calls `/api/generate-gold-image` directly (same pattern as ChoresTab) |
| `src/hooks/useGoldChores.ts` | Create | SWR hook returning available gold chores |
| `src/components/GoldApprovalOverlay.tsx` | Create | PIN pad + member selector fullscreen overlay |
| `src/components/GoldChoreCard.tsx` | Create | Gold-themed card, shows overlay on tap |
| `src/components/ChoreGrid.tsx` | Modify | Accept + render gold chores at end of grid |
| `src/app/page.tsx` | Modify | Fetch gold chores, pass to ChoreGrid |
| `src/components/admin/GoldTab.tsx` | Create | Admin tab: create, list, regenerate, delete |
| `src/components/admin/AdminShell.tsx` | Modify | Add "Gold" tab |

---

## Task 1: DB schema — add gold_chores table

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/lib/__tests__/db.test.ts`

- [ ] **Step 1: Add gold_chores table to initSchema**

  In `src/lib/db.ts`, add this block after the `chore_member_images` block (around line 101):

  ```typescript
  // Gold chores
  db.exec(`
    CREATE TABLE IF NOT EXISTS gold_chores (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      name                 TEXT NOT NULL,
      description          TEXT,
      points               INTEGER NOT NULL DEFAULT 10,
      image_path           TEXT,
      image_status         TEXT NOT NULL DEFAULT 'pending',
      status               TEXT NOT NULL DEFAULT 'available',
      awarded_to_member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
      awarded_at           DATETIME,
      created_at           DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  ```

- [ ] **Step 2: Write failing tests**

  Add to `src/lib/__tests__/db.test.ts`:

  ```typescript
  test('gold_chores table exists', () => {
    const db = getDb()
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: { name: string }) => r.name)
    expect(tables).toContain('gold_chores')
  })

  test('gold_chores has correct columns', () => {
    const db = getDb()
    const info = db.prepare('PRAGMA table_info(gold_chores)').all() as { name: string }[]
    const cols = info.map((c) => c.name)
    expect(cols).toContain('id')
    expect(cols).toContain('name')
    expect(cols).toContain('points')
    expect(cols).toContain('image_path')
    expect(cols).toContain('image_status')
    expect(cols).toContain('status')
    expect(cols).toContain('awarded_to_member_id')
    expect(cols).toContain('awarded_at')
  })
  ```

- [ ] **Step 3: Run tests**

  ```bash
  npx jest src/lib/__tests__/db.test.ts --no-coverage
  ```

  Expected: all tests PASS (including the two new ones)

- [ ] **Step 4: Commit**

  ```bash
  git add src/lib/db.ts src/lib/__tests__/db.test.ts
  git commit -m "feat: add gold_chores table to schema"
  ```

---

## Task 2: Image serving route

**Files:**
- Create: `src/app/api/gold-chore-image/[filename]/route.ts`

- [ ] **Step 1: Create the file**

  ```typescript
  import { NextRequest, NextResponse } from 'next/server'
  import fs from 'fs'
  import path from 'path'

  export async function GET(
    _req: NextRequest,
    { params }: { params: { filename: string } }
  ) {
    const safe = path.basename(params.filename)
    const filePath = path.join(process.cwd(), 'public', 'gold-chore-images', safe)

    if (!fs.existsSync(filePath)) {
      return new NextResponse('Not found', { status: 404 })
    }

    const buffer = await fs.promises.readFile(filePath)
    const ext = path.extname(safe).toLowerCase()
    const contentType = ext === '.png' ? 'image/png' : 'image/jpeg'

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/app/api/gold-chore-image/
  git commit -m "feat: add gold-chore-image serving route"
  ```

---

## Task 3: Image generation route

**Files:**
- Create: `src/app/api/generate-gold-image/route.ts`

- [ ] **Step 1: Create the file**

  This is almost identical to `src/app/api/generate-image/route.ts` but with a person-free prompt, no `member_id`, and targeting the `gold_chores` table and `public/gold-chore-images/` directory.

  ```typescript
  import { NextRequest, NextResponse } from 'next/server'
  import { getDb } from '@/lib/db'
  import { GoogleGenAI } from '@google/genai'
  import fs from 'fs'
  import path from 'path'

  export const maxDuration = 120

  const GOLD_PROMPT = `A single illustration for a children's chore chart. Pure white background — no scenes, no borders, no panels, no collage, no multiple views. One image only.

  Style: flat vector cartoon, simple shapes, soft pastel colours, clean outlines, minimal detail. Think simple app icon meets children's picture book.

  Content: a cheerful illustration of a household chore, showing only the objects and environment involved — no people, no characters, no figures of any kind. Focus on the task itself through objects alone (for example: a broom and dustpan for sweeping, a garden hoe and soil for gardening). Include only the one or two essential props needed to show the task — nothing else.

  Do not show any people or characters. Do not show step-by-step panels. Do not add backgrounds, textures, or decorative elements. White background only.`

  export async function POST(req: NextRequest) {
    const { gold_chore_id, chore_name } = await req.json() as { gold_chore_id: number; chore_name: string }
    const db = getDb()

    db.prepare(
      `UPDATE gold_chores SET image_status = 'pending', image_path = NULL WHERE id = ?`
    ).run(gold_chore_id)

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })
      const prompt = `${GOLD_PROMPT}\n\nThe chore being illustrated is: ${chore_name}.`

      const response = await ai.models.generateContent({
        model: 'nano-banana-pro-preview',
        contents: prompt,
        config: { responseModalities: ['IMAGE'] },
      })

      type ImagePart = { inlineData?: { data?: string; mimeType?: string } }
      const parts = (response.candidates?.[0]?.content?.parts ?? []) as ImagePart[]
      const imgPart = parts.find(p => p.inlineData?.data)
      if (!imgPart?.inlineData?.data) throw new Error('No image data returned from Google')

      const base64 = imgPart.inlineData.data as string
      const mimeType = imgPart.inlineData.mimeType ?? 'image/jpeg'
      const ext = mimeType === 'image/png' ? 'png' : 'jpg'
      const filename = `gold_${gold_chore_id}.${ext}`
      const destPath = path.join(process.cwd(), 'public', 'gold-chore-images', filename)
      fs.mkdirSync(path.dirname(destPath), { recursive: true })
      await fs.promises.writeFile(destPath, Buffer.from(base64, 'base64'))

      db.prepare(
        `UPDATE gold_chores SET image_path = ?, image_status = 'ready' WHERE id = ?`
      ).run(`/api/gold-chore-image/${filename}`, gold_chore_id)

      return NextResponse.json({ ok: true, image_path: `/api/gold-chore-image/${filename}` })

    } catch (err: unknown) {
      db.prepare(`UPDATE gold_chores SET image_status = 'failed' WHERE id = ?`).run(gold_chore_id)
      const message = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/app/api/generate-gold-image/
  git commit -m "feat: add generate-gold-image API route"
  ```

---

## Task 4: Gold chores CRUD routes

**Files:**
- Create: `src/app/api/gold-chores/route.ts`
- Create: `src/app/api/gold-chores/[id]/route.ts`

- [ ] **Step 1: Create the list + create route**

  ```typescript
  // src/app/api/gold-chores/route.ts
  import { NextRequest, NextResponse } from 'next/server'
  import { getDb } from '@/lib/db'

  // GET /api/gold-chores — returns all gold chores (both available and awarded)
  export function GET() {
    const rows = getDb()
      .prepare('SELECT * FROM gold_chores ORDER BY created_at DESC')
      .all()
    return NextResponse.json(rows)
  }

  // POST /api/gold-chores — create a gold chore, image generation is triggered by the client
  export async function POST(req: NextRequest) {
    const { name, description, points } = await req.json() as {
      name: string
      description?: string
      points: number
    }
    const db = getDb()
    const result = db
      .prepare(`INSERT INTO gold_chores (name, description, points) VALUES (?, ?, ?)`)
      .run(name, description ?? null, points)
    const id = result.lastInsertRowid as number
    const row = db.prepare('SELECT * FROM gold_chores WHERE id = ?').get(id)
    return NextResponse.json(row, { status: 201 })
  }
  ```

- [ ] **Step 2: Create the delete route**

  ```typescript
  // src/app/api/gold-chores/[id]/route.ts
  import { NextRequest, NextResponse } from 'next/server'
  import { getDb } from '@/lib/db'

  export async function DELETE(
    _req: NextRequest,
    { params }: { params: { id: string } }
  ) {
    getDb()
      .prepare('DELETE FROM gold_chores WHERE id = ?')
      .run(Number(params.id))
    return NextResponse.json({ ok: true })
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/app/api/gold-chores/
  git commit -m "feat: add gold-chores CRUD API routes"
  ```

---

## Task 5: Award route

**Files:**
- Create: `src/app/api/gold-chores/[id]/award/route.ts`

This route verifies the parent PIN then atomically marks the chore awarded and credits the member's unallocated points balance. Note: `verifyPin` from `src/lib/auth.ts` handles the no-PIN case — if `admin_pin_hash` is empty, the PIN '0000' is accepted.

- [ ] **Step 1: Create the file**

  ```typescript
  import { NextRequest, NextResponse } from 'next/server'
  import { getDb } from '@/lib/db'
  import { verifyPin } from '@/lib/auth'

  export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
  ) {
    const { member_id, pin } = await req.json() as { member_id: number; pin: string }
    const db = getDb()

    // Verify PIN
    const hash = (
      db.prepare("SELECT value FROM settings WHERE key='admin_pin_hash'").get() as
        | { value: string }
        | undefined
    )?.value ?? ''
    const pinOk = await verifyPin(pin, hash)
    if (!pinOk) {
      return NextResponse.json({ ok: false, error: 'Invalid PIN' }, { status: 401 })
    }

    // Check chore exists and is still available
    const chore = db
      .prepare("SELECT * FROM gold_chores WHERE id = ? AND status = 'available'")
      .get(Number(params.id)) as
        | { id: number; points: number; name: string }
        | undefined
    if (!chore) {
      return NextResponse.json({ ok: false, error: 'Chore not found or already awarded' }, { status: 404 })
    }

    // Get member's point value
    const member = db
      .prepare('SELECT point_value_cents FROM members WHERE id = ?')
      .get(member_id) as { point_value_cents: number } | undefined
    if (!member) {
      return NextResponse.json({ ok: false, error: 'Member not found' }, { status: 404 })
    }

    const earnedCents = chore.points * member.point_value_cents

    db.transaction(() => {
      // Mark chore awarded
      db.prepare(
        `UPDATE gold_chores
         SET status = 'awarded', awarded_to_member_id = ?, awarded_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(member_id, chore.id)

      // Credit unallocated balance
      db.prepare(
        `UPDATE point_balances
         SET balance_cents = balance_cents + ?, updated_at = CURRENT_TIMESTAMP
         WHERE member_id = ? AND bucket = 'unallocated'`
      ).run(earnedCents, member_id)

      // Record transaction
      db.prepare(
        `INSERT INTO point_transactions (member_id, bucket, amount_cents, reason)
         VALUES (?, 'unallocated', ?, 'gold_chore_award')`
      ).run(member_id, earnedCents)
    })()

    return NextResponse.json({ ok: true, earned_cents: earnedCents })
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/app/api/gold-chores/[id]/award/
  git commit -m "feat: add gold-chore award API route"
  ```

---

## Task 6: (skipped — no regenerate route needed)

`GoldTab` calls `/api/generate-gold-image` directly from the client, matching the existing pattern in `ChoresTab`. The `generate-gold-image` route already resets `image_status` to `'pending'` as its first action, making a separate regenerate route redundant.

---

## Task 7: useGoldChores hook

**Files:**
- Create: `src/hooks/useGoldChores.ts`

- [ ] **Step 1: Create the file**

  ```typescript
  'use client'
  import useSWR from 'swr'

  const fetcher = (url: string) => fetch(url).then((r) => r.json())

  export interface GoldChore {
    id: number
    name: string
    description: string | null
    points: number
    image_path: string | null
    image_status: 'pending' | 'ready' | 'failed'
    status: 'available' | 'awarded'
    awarded_to_member_id: number | null
    awarded_at: string | null
    created_at: string
  }

  export function useGoldChores() {
    const { data, mutate } = useSWR<GoldChore[]>('/api/gold-chores', fetcher, {
      refreshInterval: 5000,
    })

    const allGoldChores = data ?? []
    const goldChores = allGoldChores.filter((c) => c.status === 'available')

    return { goldChores, allGoldChores, mutate }
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/hooks/useGoldChores.ts
  git commit -m "feat: add useGoldChores hook"
  ```

---

## Task 8: GoldApprovalOverlay component

**Files:**
- Create: `src/components/GoldApprovalOverlay.tsx`

This component is modelled after `PinGate.tsx` (same numpad layout, shake animation, lockout after 3 attempts) but adds a member selector above the PIN pad and calls the award API instead of verify-pin.

- [ ] **Step 1: Create the file**

  ```typescript
  'use client'
  import { useState, useRef, useEffect } from 'react'
  import type { Member } from '@/hooks/useMembers'

  interface Props {
    choreId: number
    choreName: string
    chorePoints: number
    members: Member[]
    initialMemberId: number | null
    onSuccess: (earnedCents: number) => void
    onClose: () => void
  }

  export default function GoldApprovalOverlay({
    choreId,
    choreName,
    chorePoints,
    members,
    initialMemberId,
    onSuccess,
    onClose,
  }: Props) {
    const [selectedId, setSelectedId] = useState<number | null>(
      initialMemberId ?? members[0]?.id ?? null
    )
    const [pin, setPin] = useState('')
    const [shake, setShake] = useState(false)
    const [attempts, setAttempts] = useState(0)
    const [locked, setLocked] = useState(false)
    const [lockSeconds, setLockSeconds] = useState(0)
    const lockRef = useRef<NodeJS.Timeout | null>(null)

    useEffect(() => {
      return () => { if (lockRef.current) clearInterval(lockRef.current) }
    }, [])

    const press = (digit: string) => {
      if (locked || !selectedId) return
      const next = pin + digit
      setPin(next)
      if (next.length === 4) award(next)
    }

    const award = async (p: string) => {
      if (!selectedId) return
      const res = await fetch(`/api/gold-chores/${choreId}/award`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: selectedId, pin: p }),
      })
      const data = await res.json() as { ok?: boolean; earned_cents?: number }
      if (data.ok) {
        onSuccess(data.earned_cents ?? 0)
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
    const selectedMember = members.find((m) => m.id === selectedId)

    return (
      <div
        className="fixed inset-0 flex items-center justify-center bg-black/80 z-50"
        onClick={onClose}
      >
        <div
          className="flex flex-col items-center gap-5 p-8 rounded-3xl"
          style={{
            background: 'rgba(20,15,5,0.95)',
            border: '2px solid #f59e0b',
            boxShadow: '0 0 40px rgba(245,158,11,0.3)',
            animation: shake ? 'shake 0.4s' : undefined,
            maxWidth: '340px',
            width: '90vw',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="text-center">
            <div
              className="text-2xl font-bold text-amber-400"
              style={{ fontFamily: 'var(--font-fredoka)' }}
            >
              ⭐ {choreName}
            </div>
            <div className="text-white/50 text-sm mt-1">Award {chorePoints} pts to:</div>
          </div>

          {/* Member selector */}
          <div className="flex gap-2 flex-wrap justify-center">
            {members.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
                style={{
                  background: selectedId === m.id ? m.colour : 'rgba(255,255,255,0.08)',
                  color: selectedId === m.id ? 'white' : 'rgba(255,255,255,0.5)',
                  border: `2px solid ${selectedId === m.id ? m.colour : 'transparent'}`,
                }}
              >
                {m.name}
              </button>
            ))}
          </div>

          {selectedMember && (
            <div className="text-xs text-white/40">
              Enter parent PIN to award to {selectedMember.name}
            </div>
          )}

          {/* PIN dots */}
          <div className="flex gap-3">
            {[0,1,2,3].map((i) => (
              <div
                key={i}
                className="w-5 h-5 rounded-full border-2"
                style={{
                  borderColor: 'rgba(245,158,11,0.4)',
                  background: pin.length > i ? '#f59e0b' : 'transparent',
                }}
              />
            ))}
          </div>

          {locked && (
            <div className="text-red-400 text-sm">Locked — try again in {lockSeconds}s</div>
          )}

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-3">
            {digits.map((d, i) => (
              <button
                key={i}
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

- [ ] **Step 2: Commit**

  ```bash
  git add src/components/GoldApprovalOverlay.tsx
  git commit -m "feat: add GoldApprovalOverlay component"
  ```

---

## Task 9: GoldChoreCard component

**Files:**
- Create: `src/components/GoldChoreCard.tsx`

- [ ] **Step 1: Create the file**

  ```typescript
  'use client'
  import { useState } from 'react'
  import GoldApprovalOverlay from './GoldApprovalOverlay'
  import type { Member } from '@/hooks/useMembers'

  interface Props {
    id: number
    name: string
    imagePath: string | null
    imageStatus: 'pending' | 'ready' | 'failed'
    points: number
    members: Member[]
    activeMemberId: number | null
    onAwarded: () => void
  }

  export default function GoldChoreCard({
    id,
    name,
    imagePath,
    imageStatus,
    points,
    members,
    activeMemberId,
    onAwarded,
  }: Props) {
    const [showOverlay, setShowOverlay] = useState(false)

    const handleSuccess = async () => {
      setShowOverlay(false)
      const { default: confetti } = await import('canvas-confetti')
      confetti({ particleCount: 200, spread: 90, origin: { y: 0.6 } })
      onAwarded()
    }

    return (
      <>
        <button
          onClick={() => setShowOverlay(true)}
          className="relative rounded-2xl overflow-hidden transition-all duration-200 active:scale-95 w-full h-full"
          style={{
            border: '3px solid #f59e0b',
            background: 'linear-gradient(160deg, rgba(245,158,11,0.15), rgba(0,0,0,0.3))',
            display: 'grid',
            gridTemplateRows: '1fr auto',
            boxShadow: '0 0 16px rgba(245,158,11,0.3)',
          }}
        >
          {/* Image area */}
          <div
            className="w-full overflow-hidden flex items-center justify-center bg-white"
            style={{ minHeight: 0 }}
          >
            {imageStatus === 'ready' && imagePath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagePath} alt={name} className="w-full h-full object-contain" />
            ) : (
              <span
                className="text-4xl"
                style={{ animation: imageStatus === 'pending' ? 'pulse 2s infinite' : undefined }}
              >
                {imageStatus === 'failed' ? '⚠️' : '⏳'}
              </span>
            )}
          </div>

          {/* Gold label */}
          <div
            className="text-center font-extrabold leading-snug"
            style={{
              fontSize: 'clamp(1rem, 2.2vw, 2rem)',
              padding: 'clamp(0.5rem, 1.2vw, 1.25rem) clamp(0.4rem, 1vw, 1rem)',
              background: 'linear-gradient(90deg, #92400e, #b45309)',
              color: '#fef3c7',
              letterSpacing: '0.01em',
            }}
          >
            ⭐ {name} · {points}pt
          </div>
        </button>

        {showOverlay && (
          <GoldApprovalOverlay
            choreId={id}
            choreName={name}
            chorePoints={points}
            members={members}
            initialMemberId={activeMemberId}
            onSuccess={handleSuccess}
            onClose={() => setShowOverlay(false)}
          />
        )}
      </>
    )
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/components/GoldChoreCard.tsx
  git commit -m "feat: add GoldChoreCard component"
  ```

---

## Task 10: Update ChoreGrid to render gold chores

**Files:**
- Modify: `src/components/ChoreGrid.tsx`

- [ ] **Step 1: Update the component**

  Replace the entire contents of `src/components/ChoreGrid.tsx` with:

  ```typescript
  'use client'
  import { computeGridLayout } from '@/lib/grid'
  import ChoreCard from './ChoreCard'
  import GoldChoreCard from './GoldChoreCard'
  import type { Chore } from '@/hooks/useChores'
  import type { GoldChore } from '@/hooks/useGoldChores'
  import type { Member } from '@/hooks/useMembers'

  interface Props {
    chores: Chore[]
    completedIds: Set<number>
    accentColour: string
    pendingIds?: Set<number>
    onToggle: (choreId: number) => void
    goldChores?: GoldChore[]
    members?: Member[]
    activeMemberId?: number | null
    onGoldAwarded?: () => void
  }

  export default function ChoreGrid({
    chores,
    completedIds,
    accentColour,
    pendingIds,
    onToggle,
    goldChores = [],
    members = [],
    activeMemberId = null,
    onGoldAwarded,
  }: Props) {
    const total = chores.length + goldChores.length
    const { cols, rows } = computeGridLayout(total)

    if (total === 0) {
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
            isPending={pendingIds?.has(chore.id)}
            onToggle={onToggle}
          />
        ))}
        {goldChores.map((gc) => (
          <GoldChoreCard
            key={`gold-${gc.id}`}
            id={gc.id}
            name={gc.name}
            imagePath={gc.image_path}
            imageStatus={gc.image_status}
            points={gc.points}
            members={members}
            activeMemberId={activeMemberId}
            onAwarded={onGoldAwarded ?? (() => {})}
          />
        ))}
      </div>
    )
  }
  ```

- [ ] **Step 2: Run existing grid tests to confirm nothing broke**

  ```bash
  npx jest src/lib/__tests__/grid.test.ts --no-coverage
  ```

  Expected: all PASS

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/ChoreGrid.tsx
  git commit -m "feat: render gold chores at end of ChoreGrid"
  ```

---

## Task 11: Wire gold chores into page.tsx

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add the hook and pass props**

  Add the `useGoldChores` import and hook call, then pass gold chore props to `ChoreGrid`. The diff below shows only the changed parts.

  At the top of the file, add this import alongside the other hook imports:

  ```typescript
  import { useGoldChores } from '@/hooks/useGoldChores'
  ```

  Inside `HomePage`, after the `const points = usePoints(activeMemberId)` line, add:

  ```typescript
  const { goldChores, mutate: mutateGoldChores } = useGoldChores()
  ```

  Replace the `<ChoreGrid ... />` block with:

  ```tsx
  <ChoreGrid
    chores={chores}
    completedIds={completedIds}
    accentColour={accentColour}
    pendingIds={pendingIds}
    onToggle={handleToggle}
    goldChores={goldChores}
    members={members}
    activeMemberId={activeMemberId}
    onGoldAwarded={() => { mutateGoldChores(); points.mutate() }}
  />
  ```

- [ ] **Step 2: Verify the dev build compiles**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors

- [ ] **Step 3: Commit**

  ```bash
  git add src/app/page.tsx
  git commit -m "feat: wire gold chores into main page"
  ```

---

## Task 12: GoldTab admin component

**Files:**
- Create: `src/components/admin/GoldTab.tsx`

- [ ] **Step 1: Create the file**

  ```typescript
  'use client'
  import { useState } from 'react'
  import { useGoldChores } from '@/hooks/useGoldChores'
  import type { GoldChore } from '@/hooks/useGoldChores'

  type GoldForm = { name: string; points: number }

  export default function GoldTab() {
    const { allGoldChores, mutate } = useGoldChores()
    const [form, setForm] = useState<GoldForm | null>(null)

    const available = allGoldChores.filter((c) => c.status === 'available')
    const awarded   = allGoldChores.filter((c) => c.status === 'awarded')

    const triggerGeneration = (id: number, name: string) => {
      fetch('/api/generate-gold-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gold_chore_id: id, chore_name: name }),
      })
      setTimeout(() => mutate(), 500)
    }

    const save = async () => {
      if (!form) return
      const res = await fetch('/api/gold-chores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const created = await res.json() as GoldChore
      setForm(null)
      mutate()
      if (created?.id) {
        triggerGeneration(created.id, created.name)
      }
    }

    const del = async (id: number) => {
      if (!confirm('Delete this gold chore?')) return
      await fetch('/api/gold-chores/' + id, { method: 'DELETE' })
      mutate()
    }

    const regen = (c: GoldChore) => {
      triggerGeneration(c.id, c.name)
    }

    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'var(--font-fredoka)' }}>
            ⭐ Gold Chores
          </h2>
          <button
            onClick={() => setForm({ name: '', points: 10 })}
            className="px-4 py-2 rounded-xl text-sm font-bold text-white"
            style={{ background: '#b45309' }}
          >
            + Add Gold Chore
          </button>
        </div>

        {/* Active gold chores */}
        {available.length === 0 && (
          <div className="text-white/30 text-sm">No active gold chores. Add one above.</div>
        )}

        {available.map((c) => (
          <GoldChoreRow key={c.id} chore={c} onRegen={regen} onDelete={del} />
        ))}

        {/* Awarded history */}
        {awarded.length > 0 && (
          <details className="mt-4">
            <summary className="text-white/40 text-sm cursor-pointer select-none">
              Awarded history ({awarded.length})
            </summary>
            <div className="flex flex-col gap-2 mt-2">
              {awarded.map((c) => (
                <div key={c.id}
                  className="flex items-center gap-3 p-3 rounded-2xl"
                  style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                  <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-white/10">
                    {c.image_status === 'ready' && c.image_path
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={c.image_path} alt={c.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-sm">⭐</div>}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-white/60 text-sm">{c.name}</div>
                    <div className="text-xs text-white/30">
                      {c.points}pt · awarded {c.awarded_at ? new Date(c.awarded_at).toLocaleDateString() : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Create modal */}
        {form && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50">
            <div className="flex flex-col gap-3 p-6 rounded-3xl w-80"
              style={{ background: '#1a1a2e', border: '2px solid #f59e0b' }}>
              <h3 className="text-lg font-bold text-amber-400">New Gold Chore</h3>
              <input
                type="text"
                placeholder="Chore name"
                value={form.name}
                onChange={(e) => setForm((p) => p && ({ ...p, name: e.target.value }))}
                className="px-3 py-2 rounded-xl bg-white/10 text-white outline-none border border-white/10"
              />
              <div className="flex flex-col gap-1">
                <label className="text-xs text-white/50">Points</label>
                <input
                  type="number"
                  min={1}
                  value={form.points}
                  onChange={(e) => setForm((p) => p && ({ ...p, points: Number(e.target.value) }))}
                  className="px-3 py-2 rounded-xl bg-white/10 text-white outline-none border border-white/10"
                />
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => setForm(null)}
                  className="flex-1 py-2 rounded-xl text-sm font-bold text-white/50"
                  style={{ background: 'rgba(255,255,255,0.08)' }}>
                  Cancel
                </button>
                <button onClick={save}
                  className="flex-1 py-2 rounded-xl text-sm font-bold text-white"
                  style={{ background: '#b45309' }}
                  disabled={!form.name.trim()}>
                  Save & Generate
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  function GoldChoreRow({
    chore,
    onRegen,
    onDelete,
  }: {
    chore: GoldChore
    onRegen: (c: GoldChore) => void
    onDelete: (id: number) => void
  }) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-2xl"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}>
        <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-white/10">
          {chore.image_status === 'ready' && chore.image_path
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={chore.image_path} alt={chore.name} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-lg">
                {chore.image_status === 'failed' ? '⚠️' : '⏳'}
              </div>}
        </div>
        <div className="flex-1">
          <div className="font-bold text-white text-sm">{chore.name}</div>
          <div className="text-xs text-amber-400/70">⭐ {chore.points} pts</div>
        </div>
        <button
          onClick={() => onRegen(chore)}
          className="px-2 py-1 rounded-lg text-xs font-bold"
          style={{
            background: chore.image_status === 'failed' ? 'rgba(234,179,8,0.1)' : 'rgba(255,255,255,0.06)',
            color: chore.image_status === 'failed' ? '#facc15' : 'rgba(255,255,255,0.4)',
          }}>
          {chore.image_status === 'failed' ? 'Retry' : '↻'}
        </button>
        <button
          onClick={() => onDelete(chore.id)}
          className="px-3 py-1 rounded-lg text-xs font-bold text-red-400"
          style={{ background: 'rgba(239,68,68,0.1)' }}>
          Del
        </button>
      </div>
    )
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/components/admin/GoldTab.tsx
  git commit -m "feat: add GoldTab admin component"
  ```

---

## Task 13: Add Gold tab to AdminShell

**Files:**
- Modify: `src/components/admin/AdminShell.tsx`

- [ ] **Step 1: Add GoldTab import and tab entry**

  Add the import at the top of the file alongside other tab imports:

  ```typescript
  import GoldTab from './GoldTab'
  ```

  Update the `Tab` type to include `'gold'`:

  ```typescript
  type Tab = 'members' | 'chores' | 'schedule' | 'points' | 'pin' | 'gold'
  ```

  Add the new tab to `TABS` array (insert after `chores` entry):

  ```typescript
  { id: 'gold', label: 'Gold Chores', icon: '⭐' },
  ```

  Add the render in the tab content area (after `{tab === 'chores' && <ChoresTab />}`):

  ```typescript
  {tab === 'gold' && <GoldTab />}
  ```

- [ ] **Step 2: Run TypeScript check**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors

- [ ] **Step 3: Run all tests**

  ```bash
  npx jest --no-coverage
  ```

  Expected: all PASS

- [ ] **Step 4: Final commit**

  ```bash
  git add src/components/admin/AdminShell.tsx
  git commit -m "feat: add Gold Chores tab to admin panel"
  ```

---

## Verification checklist

After all tasks are complete, manually verify:

- [ ] Admin → Gold Chores tab visible and accessible after PIN entry
- [ ] Create a gold chore → image generation starts (spinner shows), image appears within ~30s
- [ ] ↻ button regenerates the image
- [ ] Del button removes the chore
- [ ] Gold chore card appears at the end of the main chore grid for all members
- [ ] Tapping gold chore card shows the overlay with member selector and PIN pad
- [ ] Selecting a different member in the overlay changes who receives the points
- [ ] Entering wrong PIN shakes the overlay and resets — after 3 fails, lockout engages
- [ ] Entering correct PIN (default `0000` if no PIN set, or custom PIN from Change PIN tab) awards the chore
- [ ] Confetti fires on successful award
- [ ] Awarded gold chore disappears from the main grid
- [ ] Unallocated points balance updates correctly
- [ ] Awarded history visible in admin Gold tab
