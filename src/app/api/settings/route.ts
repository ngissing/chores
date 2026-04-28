import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { hashPin, verifyPin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export function GET() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as {
    key: string; value: string
  }[]
  const result: Record<string, string> = {}
  for (const { key, value } of rows) result[key] = value
  delete result['admin_pin_hash']  // never send the hash to the client
  return NextResponse.json(result)
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const db = getDb()
  const upsert = db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`)

  if (body.action === 'change_pin') {
    const currentHash =
      (db.prepare("SELECT value FROM settings WHERE key='admin_pin_hash'").get() as { value: string } | undefined)?.value ?? ''
    if (!(await verifyPin(body.current_pin, currentHash))) {
      return NextResponse.json({ error: 'Incorrect PIN' }, { status: 403 })
    }
    const newHash = await hashPin(body.new_pin)
    upsert.run('admin_pin_hash', newHash)
    return NextResponse.json({ ok: true })
  }

  const allowed = ['morning_start_time', 'afternoon_start_time', 'daily_reset_time']
  for (const key of allowed) {
    if (body[key] !== undefined) upsert.run(key, body[key])
  }
  return NextResponse.json({ ok: true })
}
