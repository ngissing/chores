import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  getDb()
    .prepare('DELETE FROM gold_chores WHERE id = ?')
    .run(Number(params.id))
  return NextResponse.json({ ok: true })
}
