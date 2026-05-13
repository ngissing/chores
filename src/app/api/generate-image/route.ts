import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { GoogleGenAI } from '@google/genai'
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

    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })
    const prompt = buildPrompt(chore_name, appearance)

    const response = await ai.models.generateContent({
      model: 'nano-banana-pro-preview',
      contents: prompt,
      config: { responseModalities: ['IMAGE'] },
    })

    type ImagePart = { inlineData?: { data?: string; mimeType?: string } }
    const parts = (response.candidates?.[0]?.content?.parts ?? []) as ImagePart[]
    const imgPart = parts.find(p => p.inlineData?.data)
    if (!imgPart?.inlineData?.data) throw new Error('No image data returned from Google')

    const base64 = imgPart.inlineData.data as string
    const mimeType = imgPart.inlineData.mimeType ?? 'image/jpeg'
    const ext = mimeType === 'image/png' ? 'png' : 'jpg'
    const filename = `${chore_id}_${member_id}.${ext}`
    const destPath = path.join(process.cwd(), 'public', 'chore-images', filename)
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    await fs.promises.writeFile(destPath, Buffer.from(base64, 'base64'))

    db.prepare(`
      UPDATE chore_member_images SET image_path = ?, image_status = 'ready'
      WHERE chore_id = ? AND member_id = ?
    `).run(`/api/chore-image/${filename}`, chore_id, member_id)

    return NextResponse.json({ ok: true, image_path: `/api/chore-image/${filename}` })

  } catch (err: unknown) {
    db.prepare(`
      UPDATE chore_member_images SET image_status = 'failed'
      WHERE chore_id = ? AND member_id = ?
    `).run(chore_id, member_id)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
