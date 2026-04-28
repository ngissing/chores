import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// POST { member_id } — checks if all routine chores are done; updates streak if so
export async function POST(req: NextRequest) {
  const { member_id } = await req.json()
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)

  // Determine current routine
  const afternoonTime =
    (db.prepare("SELECT value FROM settings WHERE key='afternoon_start_time'").get() as { value: string } | undefined)?.value ?? '12:00'
  const [ah, am] = afternoonTime.split(':').map(Number)
  const now = new Date()
  const routine =
    now.getHours() * 60 + now.getMinutes() >= ah * 60 + am ? 'afternoon' : 'morning'

  const assigned = db.prepare(`
    SELECT c.id FROM chores c
    JOIN chore_assignments ca ON ca.chore_id = c.id
    WHERE ca.member_id = ? AND (c.routine = ? OR c.routine = 'both')
  `).all(member_id, routine) as { id: number }[]

  if (assigned.length === 0) return NextResponse.json({ streak_updated: false, all_done: false })

  const completedToday = db
    .prepare('SELECT chore_id FROM completions WHERE member_id=? AND date=?')
    .all(member_id, today) as { chore_id: number }[]

  const completedIds = new Set(completedToday.map((c) => c.chore_id))
  const allDone = assigned.every((a) => completedIds.has(a.id))

  if (!allDone) return NextResponse.json({ streak_updated: false, all_done: false })

  const member = db
    .prepare('SELECT streak_days, last_streak_date FROM members WHERE id=?')
    .get(member_id) as { streak_days: number; last_streak_date: string | null } | undefined

  if (!member) return NextResponse.json({ streak_updated: false, all_done: false })
  if (member.last_streak_date === today) return NextResponse.json({ streak_updated: false, reason: 'already_updated', all_done: true })

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)
  const newStreak = member.last_streak_date === yesterdayStr ? member.streak_days + 1 : 1

  db.prepare('UPDATE members SET streak_days=?, last_streak_date=? WHERE id=?')
    .run(newStreak, today, member_id)

  return NextResponse.json({ streak_updated: true, streak_days: newStreak, all_done: true })
}
