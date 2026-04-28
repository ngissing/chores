import { hashPin, verifyPin, DEFAULT_PIN } from '../auth'

test('DEFAULT_PIN is 0000', () => {
  expect(DEFAULT_PIN).toBe('0000')
})

test('hashPin produces a bcrypt hash', async () => {
  const hash = await hashPin('1234')
  expect(hash).toMatch(/^\$2/)
})

test('verifyPin returns true for correct PIN against hash', async () => {
  const hash = await hashPin('5678')
  expect(await verifyPin('5678', hash)).toBe(true)
  expect(await verifyPin('0000', hash)).toBe(false)
})

test('verifyPin falls back to DEFAULT_PIN when hash is empty', async () => {
  expect(await verifyPin('0000', '')).toBe(true)
  expect(await verifyPin('9999', '')).toBe(false)
})
