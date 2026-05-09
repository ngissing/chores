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
