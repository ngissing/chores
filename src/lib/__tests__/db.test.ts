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
  expect(tables).toContain('chore_member_images')
  expect(tables).toContain('gold_chores')
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

test('members table has appearance column', () => {
  const db = getDb()
  const info = db.prepare('PRAGMA table_info(members)').all() as { name: string }[]
  expect(info.map((c) => c.name)).toContain('appearance')
})

test('chore_member_images table exists', () => {
  const db = getDb()
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r: { name: string }) => r.name)
  expect(tables).toContain('chore_member_images')
})

test('chore_member_images has correct columns', () => {
  const db = getDb()
  const info = db.prepare('PRAGMA table_info(chore_member_images)').all() as { name: string }[]
  const cols = info.map((c) => c.name)
  expect(cols).toContain('chore_id')
  expect(cols).toContain('member_id')
  expect(cols).toContain('image_path')
  expect(cols).toContain('image_status')
})

test('chore_member_images enforces FK on chore_id', () => {
  const db = getDb()
  expect(() => {
    db.prepare(
      "INSERT INTO chore_member_images (chore_id, member_id, image_path, image_status) VALUES (999999, 1, '/fake/path.png', 'pending')"
    ).run()
  }).toThrow()
})

test('gold_chores table exists', () => {
  const db = getDb()
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r: { name: string }) => r.name)
  expect(tables).toContain('gold_chores')
})

test('gold_chores has correct columns', () => {
  const db = getDb()
  const info = db.prepare('PRAGMA table_info(gold_chores)').all() as { name: string }[]
  const cols = info.map((c) => c.name)
  expect(cols).toContain('id')
  expect(cols).toContain('name')
  expect(cols).toContain('points')
  expect(cols).toContain('image_path')
  expect(cols).toContain('image_status')
  expect(cols).toContain('status')
  expect(cols).toContain('awarded_to_member_id')
  expect(cols).toContain('awarded_at')
})
