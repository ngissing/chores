import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { bestMs } from '@/lib/stopwatch'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { member_id, duration_ms } = await req.json()
  if (!Number.isFinite(member_id) || !Number.isFinite(duration_ms) || duration_ms < 0) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }
  const db = getDb()
  db.prepare('INSERT INTO stopwatch_runs (member_id, duration_ms) VALUES (?, ?)').run(
    member_id,
    Math.floor(duration_ms)
  )
  const runs = db
    .prepare('SELECT duration_ms FROM stopwatch_runs WHERE member_id = ?')
    .all(member_id) as { duration_ms: number }[]
  return NextResponse.json({ ok: true, best_ms: bestMs(runs) })
}

export function GET(req: NextRequest) {
  const memberId = Number(req.nextUrl.searchParams.get('member_id'))
  if (!Number.isFinite(memberId)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }
  const db = getDb()
  const recent = db
    .prepare('SELECT duration_ms, created_at FROM stopwatch_runs WHERE member_id = ? ORDER BY id DESC LIMIT 5')
    .all(memberId) as { duration_ms: number; created_at: string }[]
  const all = db
    .prepare('SELECT duration_ms FROM stopwatch_runs WHERE member_id = ?')
    .all(memberId) as { duration_ms: number }[]
  return NextResponse.json({ runs: recent, best_ms: bestMs(all) })
}
