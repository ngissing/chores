import bcrypt from 'bcryptjs'

export const DEFAULT_PIN = '0000'

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10)
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  if (!hash) return pin === DEFAULT_PIN
  return bcrypt.compare(pin, hash)
}
