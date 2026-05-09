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
