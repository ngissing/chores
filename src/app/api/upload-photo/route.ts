import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import fs from 'fs'
import path from 'path'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('photo') as File | null
  const memberId = formData.get('member_id') as string | null

  if (!file || !memberId) {
    return NextResponse.json({ error: 'photo and member_id required' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() ?? 'jpg'
  const filename = `member-${memberId}.${ext}`
  const destPath = path.join(process.cwd(), 'public', 'member-photos', filename)

  const buffer = Buffer.from(await file.arrayBuffer())
  fs.writeFileSync(destPath, buffer)

  const photoPath = `/member-photos/${filename}`
  getDb().prepare('UPDATE members SET photo_path=? WHERE id=?').run(photoPath, Number(memberId))

  return NextResponse.json({ ok: true, photo_path: photoPath })
}
