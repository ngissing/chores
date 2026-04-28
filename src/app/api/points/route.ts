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

export async function POST(req: NextRequest) {
  const body = await req.json()
  const db = getDb()

  if (body.action === 'allocate') {
    const { member_id, allocations } = body
    const total =
      (allocations.spend ?? 0) + (allocations.save ?? 0) + (allocations.give ?? 0)
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
