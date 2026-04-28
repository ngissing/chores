import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'chores.db')

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
  _db = new Database(DB_PATH)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  initSchema(_db)
  return _db
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT NOT NULL,
      age              INTEGER NOT NULL,
      colour           TEXT NOT NULL DEFAULT '#6366f1',
      photo_path       TEXT,
      point_value_cents INTEGER NOT NULL DEFAULT 10,
      streak_days      INTEGER NOT NULL DEFAULT 0,
      last_streak_date TEXT,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chores (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      image_path   TEXT,
      image_status TEXT NOT NULL DEFAULT 'pending',
      points       INTEGER NOT NULL DEFAULT 1,
      routine      TEXT NOT NULL DEFAULT 'morning',
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chore_assignments (
      chore_id  INTEGER NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      PRIMARY KEY (chore_id, member_id)
    );

    CREATE TABLE IF NOT EXISTS completions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      chore_id     INTEGER NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
      member_id    INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      date         TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS point_balances (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id     INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      bucket        TEXT NOT NULL,
      balance_cents INTEGER NOT NULL DEFAULT 0,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(member_id, bucket)
    );

    CREATE TABLE IF NOT EXISTS point_transactions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id    INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      bucket       TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      reason       TEXT NOT NULL,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // Seed default settings
  const defaults: [string, string][] = [
    ['morning_start_time', '06:00'],
    ['afternoon_start_time', '12:00'],
    ['daily_reset_time', '00:00'],
    ['admin_pin_hash', ''],
  ]
  const upsert = db.prepare(
    `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`
  )
  for (const [k, v] of defaults) upsert.run(k, v)
}
