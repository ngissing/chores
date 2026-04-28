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
  const result = (chores as { id: number }[]).map((c) => ({
    ...c,
    member_ids: byChore[c.id] ?? [],
  }))
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

  return NextResponse.json({ id: choreId }, { status: 201 })
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
