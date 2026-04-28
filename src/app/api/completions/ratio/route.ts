import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/completions/ratio?days=7
export function GET(req: NextRequest) {
  const days = Number(new URL(req.url).searchParams.get('days') ?? '7')
  const db = getDb()

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const since = cutoff.toISOString().slice(0, 10)

  const members = db.prepare('SELECT id, name FROM members').all() as { id: number; name: string }[]

  const result = members.map((m) => {
    const completed = (
      db.prepare(`
        SELECT COUNT(DISTINCT date || '-' || chore_id) as cnt
        FROM completions WHERE member_id=? AND date>=?
      `).get(m.id, since) as { cnt: number }
    ).cnt

    const assignedCount = (
      db.prepare('SELECT COUNT(*) as cnt FROM chore_assignments WHERE member_id=?').get(m.id) as { cnt: number }
    ).cnt

    const possible = assignedCount * days
    const rate = possible > 0 ? Math.round((completed / possible) * 100) : 0

    return { member_id: m.id, name: m.name, completed, possible, rate }
  })

  return NextResponse.json(result)
}
