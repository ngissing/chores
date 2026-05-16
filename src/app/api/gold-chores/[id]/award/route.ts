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

  // Check chore exists (pre-flight — full atomic check happens inside transaction)
  const chore = db
    .prepare('SELECT id, points, name FROM gold_chores WHERE id = ?')
    .get(Number(params.id)) as
      | { id: number; points: number; name: string }
      | undefined
  if (!chore) {
    return NextResponse.json({ ok: false, error: 'Chore not found' }, { status: 404 })
  }

  // Get member's point value
  const member = db
    .prepare('SELECT point_value_cents FROM members WHERE id = ?')
    .get(member_id) as { point_value_cents: number } | undefined
  if (!member) {
    return NextResponse.json({ ok: false, error: 'Member not found' }, { status: 404 })
  }

  const earnedCents = chore.points * member.point_value_cents

  try {
    db.transaction(() => {
      // Atomic availability check — throws if already awarded
      const awardResult = db.prepare(
        `UPDATE gold_chores
         SET status = 'awarded', awarded_to_member_id = ?, awarded_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'available'`
      ).run(member_id, chore.id)

      if (awardResult.changes === 0) {
        throw new Error('CHORE_ALREADY_AWARDED')
      }

      // Upsert unallocated balance (safe even if row doesn't exist yet)
      db.prepare(
        `INSERT INTO point_balances (member_id, bucket, balance_cents, updated_at)
         VALUES (?, 'unallocated', ?, CURRENT_TIMESTAMP)
         ON CONFLICT(member_id, bucket)
         DO UPDATE SET
           balance_cents = balance_cents + excluded.balance_cents,
           updated_at    = excluded.updated_at`
      ).run(member_id, earnedCents)

      // Record transaction
      db.prepare(
        `INSERT INTO point_transactions (member_id, bucket, amount_cents, reason)
         VALUES (?, 'unallocated', ?, 'gold_chore_award')`
      ).run(member_id, earnedCents)
    })()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg === 'CHORE_ALREADY_AWARDED') {
      return NextResponse.json({ ok: false, error: 'Chore already awarded' }, { status: 409 })
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, earned_cents: earnedCents })
}
