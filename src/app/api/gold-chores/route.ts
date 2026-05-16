import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/gold-chores — returns all gold chores (both available and awarded)
export function GET() {
  const rows = getDb()
    .prepare('SELECT * FROM gold_chores ORDER BY created_at DESC')
    .all()
  return NextResponse.json(rows)
}

// POST /api/gold-chores — create a gold chore (image generation triggered by client separately)
export async function POST(req: NextRequest) {
  const { name, description, points } = await req.json() as {
    name: string
    description?: string
    points: number
  }
  const db = getDb()
  const result = db
    .prepare(`INSERT INTO gold_chores (name, description, points) VALUES (?, ?, ?)`)
    .run(name, description ?? null, points)
  const id = result.lastInsertRowid as number
  const row = db.prepare('SELECT * FROM gold_chores WHERE id = ?').get(id)
  return NextResponse.json(row, { status: 201 })
}
