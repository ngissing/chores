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
