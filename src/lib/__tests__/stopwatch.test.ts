import { formatDuration, bestMs, isPersonalBest } from '../stopwatch'

describe('formatDuration', () => {
  it('formats sub-minute as SS.cs', () => {
    expect(formatDuration(0)).toBe('0.00')
    expect(formatDuration(4200)).toBe('4.20')
    expect(formatDuration(42190)).toBe('42.19')
  })
  it('formats minutes as M:SS.cs', () => {
    expect(formatDuration(60000)).toBe('1:00.00')
    expect(formatDuration(83450)).toBe('1:23.45')
    expect(formatDuration(600000)).toBe('10:00.00')
  })
  it('floors centiseconds and clamps negatives', () => {
    expect(formatDuration(1239)).toBe('1.23')
    expect(formatDuration(-50)).toBe('0.00')
  })
})

describe('bestMs', () => {
  it('returns null for no runs', () => {
    expect(bestMs([])).toBeNull()
  })
  it('returns the minimum duration', () => {
    expect(bestMs([{ duration_ms: 5000 }, { duration_ms: 3200 }, { duration_ms: 9000 }])).toBe(3200)
  })
})

describe('isPersonalBest', () => {
  it('is true when there are no prior runs', () => {
    expect(isPersonalBest(5000, [])).toBe(true)
  })
  it('is true only when strictly faster than the best prior', () => {
    const prior = [{ duration_ms: 5000 }, { duration_ms: 4000 }]
    expect(isPersonalBest(3999, prior)).toBe(true)
    expect(isPersonalBest(4000, prior)).toBe(false)
    expect(isPersonalBest(4500, prior)).toBe(false)
  })
})
