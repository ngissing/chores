import cron from 'node-cron'
import { getDb } from './db'

function getSetting(key: string): string {
  const row = getDb()
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row?.value ?? ''
}

export function startScheduler() {
  // Runs every minute; performs daily reset when clock matches configured reset time
  cron.schedule('* * * * *', () => {
    const resetTime = getSetting('daily_reset_time') || '00:00'
    const [hh, mm] = resetTime.split(':').map(Number)
    const now = new Date()

    if (now.getHours() === hh && now.getMinutes() === mm) {
      const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10)
      const db = getDb()

      // Clear yesterday's completions (chore tick state resets; points are kept)
      db.prepare('DELETE FROM completions WHERE date = ?').run(yesterday)

      // Reset streaks for members who did NOT complete all chores yesterday
      const members = db
        .prepare('SELECT id, last_streak_date FROM members')
        .all() as { id: number; last_streak_date: string | null }[]

      for (const m of members) {
        if (m.last_streak_date !== yesterday) {
          db.prepare('UPDATE members SET streak_days = 0 WHERE id = ?').run(m.id)
        }
      }

      console.log(`[scheduler] Daily reset complete for ${yesterday}`)
    }
  })

  console.log('[scheduler] Started')
}
