import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { GoogleGenAI } from '@google/genai'
import fs from 'fs'
import path from 'path'

export const maxDuration = 120

const GOLD_PROMPT = `A single illustration for a children's chore chart. Pure white background — no scenes, no borders, no panels, no collage, no multiple views. One image only.

Style: flat vector cartoon, simple shapes, soft pastel colours, clean outlines, minimal detail. Think simple app icon meets children's picture book.

Content: a cheerful illustration of a household chore, showing only the objects and environment involved — no people, no characters, no figures of any kind. Focus on the task itself through objects alone (for example: a broom and dustpan for sweeping, a garden hoe and soil for gardening). Include only the one or two essential props needed to show the task — nothing else.

Do not show any people or characters. Do not show step-by-step panels. Do not add backgrounds, textures, or decorative elements. White background only.`

export async function POST(req: NextRequest) {
  const { gold_chore_id, chore_name } = await req.json() as { gold_chore_id: number; chore_name: string }
  const db = getDb()

  db.prepare(
    `UPDATE gold_chores SET image_status = 'pending', image_path = NULL WHERE id = ?`
  ).run(gold_chore_id)

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY })
    const prompt = `${GOLD_PROMPT}\n\nThe chore being illustrated is: ${chore_name}.`

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
    const filename = `gold_${gold_chore_id}.${ext}`
    const destPath = path.join(process.cwd(), 'public', 'gold-chore-images', filename)
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    await fs.promises.writeFile(destPath, Buffer.from(base64, 'base64'))

    db.prepare(
      `UPDATE gold_chores SET image_path = ?, image_status = 'ready' WHERE id = ?`
    ).run(`/api/gold-chore-image/${filename}`, gold_chore_id)

    return NextResponse.json({ ok: true, image_path: `/api/gold-chore-image/${filename}` })

  } catch (err: unknown) {
    db.prepare(`UPDATE gold_chores SET image_status = 'failed' WHERE id = ?`).run(gold_chore_id)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
