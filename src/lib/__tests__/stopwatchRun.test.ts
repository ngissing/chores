import { hasExpired, AUTO_STOP_MS } from '../stopwatchRun'

describe('AUTO_STOP_MS', () => {
  it('is two hours in milliseconds', () => {
    expect(AUTO_STOP_MS).toBe(2 * 60 * 60 * 1000)
  })
})

describe('hasExpired', () => {
  const start = 1_000_000_000_000
  it('is false before the cap', () => {
    expect(hasExpired(start, start)).toBe(false)
    expect(hasExpired(start, start + 60_000)).toBe(false)
    expect(hasExpired(start, start + AUTO_STOP_MS - 1)).toBe(false)
  })
  it('is true at and after the cap', () => {
    expect(hasExpired(start, start + AUTO_STOP_MS)).toBe(true)
    expect(hasExpired(start, start + AUTO_STOP_MS + 5_000)).toBe(true)
  })
})
