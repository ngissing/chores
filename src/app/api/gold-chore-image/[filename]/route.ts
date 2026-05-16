import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET(
  _req: NextRequest,
  { params }: { params: { filename: string } }
) {
  const safe = path.basename(params.filename)
  const filePath = path.join(process.cwd(), 'public', 'gold-chore-images', safe)

  if (!fs.existsSync(filePath)) {
    return new NextResponse('Not found', { status: 404 })
  }

  const buffer = await fs.promises.readFile(filePath)
  const ext = path.extname(safe).toLowerCase()
  const contentType = ext === '.png' ? 'image/png' : 'image/jpeg'

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
