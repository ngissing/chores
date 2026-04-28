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

// POST — mark a chore complete, immediately credit unallocated points
export async function POST(req: NextRequest) {
  const { chore_id, member_id } = await req.json()
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)

  // Idempotent: ignore if already completed today
  const existing = db
    .prepare('SELECT id FROM completions WHERE chore_id=? AND member_id=? AND date=?')
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
    db.prepare('INSERT INTO completions (chore_id, member_id, date) VALUES (?, ?, ?)').run(
      chore_id, member_id, today
    )
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

// DELETE — un-complete a chore (reverse the points credit)
export async function DELETE(req: NextRequest) {
  const { chore_id, member_id } = await req.json()
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)

  const row = db
    .prepare('SELECT id FROM completions WHERE chore_id=? AND member_id=? AND date=?')
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
