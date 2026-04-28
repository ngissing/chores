import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { verifyPin } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { pin } = await req.json()
  const hash =
    (getDb().prepare("SELECT value FROM settings WHERE key='admin_pin_hash'").get() as { value: string } | undefined)?.value ?? ''
  const ok = await verifyPin(pin, hash)
  return NextResponse.json({ ok })
}
