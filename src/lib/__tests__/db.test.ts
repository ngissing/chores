import { getDb } from '../db'

test('schema initialises all tables', () => {
  const db = getDb()
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r: { name: string }) => r.name)

  expect(tables).toContain('members')
  expect(tables).toContain('chores')
  expect(tables).toContain('chore_assignments')
  expect(tables).toContain('completions')
  expect(tables).toContain('point_balances')
  expect(tables).toContain('point_transactions')
  expect(tables).toContain('settings')
})

test('default settings are seeded', () => {
  const db = getDb()
  const val = db.prepare("SELECT value FROM settings WHERE key='daily_reset_time'").get() as { value: string } | undefined
  expect(val?.value).toBe('00:00')
})

test('members table has streak columns', () => {
  const db = getDb()
  const info = db.prepare("PRAGMA table_info(members)").all() as { name: string }[]
  const cols = info.map((c) => c.name)
  expect(cols).toContain('streak_days')
  expect(cols).toContain('last_streak_date')
})
