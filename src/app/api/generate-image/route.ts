import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import OpenAI from 'openai'
import https from 'https'
import fs from 'fs'
import path from 'path'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    https.get(url, (res) => {
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
    }).on('error', reject)
  })
}

export async function POST(req: NextRequest) {
  const { chore_id, chore_name } = await req.json()
  const db = getDb()

  db.prepare("UPDATE chores SET image_status='pending' WHERE id=?").run(chore_id)

  try {
    const prompt = `A simple, bright, friendly illustration of a child ${chore_name}, cartoon style, white background, suitable for young children`
    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
    })

    const imageUrl = response.data[0].url!
    const destPath = path.join(process.cwd(), 'public', 'chore-images', `${chore_id}.png`)
    await downloadFile(imageUrl, destPath)

    db.prepare("UPDATE chores SET image_path=?, image_status='ready' WHERE id=?")
      .run(`/chore-images/${chore_id}.png`, chore_id)

    return NextResponse.json({ ok: true, image_path: `/chore-images/${chore_id}.png` })
  } catch (err: unknown) {
    db.prepare("UPDATE chores SET image_status='failed' WHERE id=?").run(chore_id)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
