import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import OpenAI from 'openai'
import https from 'https'
import fs from 'fs'
import path from 'path'

const BASE_PROMPT = `Create a kid-friendly chore-card style illustration on a pure white background. Use a clean, cheerful children's picture-book/vector cartoon style with simple shapes, soft pastel colours, bold but gentle outlines, smooth shading, and minimal clutter.

The character should have big expressive eyes, rosy cheeks, and a happy smile completing a simple household chore. Keep the character consistent across images for specific users.

The action should be obvious at a glance and clearly show what chore needs to be completed. Use only the essential objects needed to communicate the task. Keep the composition centred, uncluttered, polished, and suitable for a children's chores chart.`

function buildPrompt(choreName: string, appearance: string): string {
  const parts = [BASE_PROMPT]
  if (appearance.trim()) {
    parts.push(
      `The character should look like: ${appearance.trim()}. Keep this character consistent across all chore images for this child.`
    )
  }
  parts.push(`The chore being completed is: ${choreName}.`)
  return parts.join('\n\n')
}

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
  const { chore_id, chore_name, member_id } = await req.json()
  const db = getDb()

  // Mark pending (upsert so retries work)
  db.prepare(`
    INSERT INTO chore_member_images (chore_id, member_id, image_status)
    VALUES (?, ?, 'pending')
    ON CONFLICT (chore_id, member_id) DO UPDATE SET image_status = 'pending', image_path = NULL
  `).run(chore_id, member_id)

  try {
    const member = db.prepare('SELECT appearance FROM members WHERE id=?')
      .get(member_id) as { appearance: string } | undefined
    const appearance = member?.appearance ?? ''

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const prompt = buildPrompt(chore_name, appearance)

    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
    })

    const imageUrl = response.data?.[0]?.url
    if (!imageUrl) throw new Error('No image URL returned from OpenAI')

    const filename = `${chore_id}_${member_id}.png`
    const destPath = path.join(process.cwd(), 'public', 'chore-images', filename)
    await downloadFile(imageUrl, destPath)

    db.prepare(`
      UPDATE chore_member_images SET image_path = ?, image_status = 'ready'
      WHERE chore_id = ? AND member_id = ?
    `).run(`/chore-images/${filename}`, chore_id, member_id)

    return NextResponse.json({ ok: true, image_path: `/chore-images/${filename}` })
  } catch (err: unknown) {
    db.prepare(`
      UPDATE chore_member_images SET image_status = 'failed'
      WHERE chore_id = ? AND member_id = ?
    `).run(chore_id, member_id)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
