import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import OpenAI from 'openai'
import fs from 'fs'
import path from 'path'

export const maxDuration = 120

const BASE_PROMPT = `A single illustration for a children's chore chart. Pure white background — no scenes, no borders, no panels, no collage, no multiple views. One image only.

Style: flat vector cartoon, simple shapes, soft pastel colours, clean outlines, minimal detail. Think simple app icon meets children's picture book.

Content: one cheerful child character with big eyes, rosy cheeks, and a happy smile, clearly performing a household chore. The chore action must be the obvious focus. Include only the one or two essential props needed to show the task — nothing else.

Do not show multiple versions of the character. Do not show step-by-step panels. Do not add backgrounds, textures, or decorative elements. White background only.`

function buildPrompt(choreName: string, appearance: string): string {
  const parts = [BASE_PROMPT]
  if (appearance.trim()) {
    parts.push(`The child character should look like: ${appearance.trim()}.`)
  }
  parts.push(`The chore being illustrated is: ${choreName}.`)
  return parts.join('\n\n')
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download image: ${res.status} ${res.statusText}`)
  const buffer = await res.arrayBuffer()
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  await fs.promises.writeFile(dest, Buffer.from(buffer))
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
