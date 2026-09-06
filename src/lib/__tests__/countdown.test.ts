import {
  parseCountdownSettings,
  computeCountdownState,
  DEFAULTS,
} from '../countdown'

// A fixed weekday (Wed 2026-09-09) and weekend (Sat 2026-09-12) in local time.
const wedAt = (h: number, m: number) => new Date(2026, 8, 9, h, m, 0)
const satAt = (h: number, m: number) => new Date(2026, 8, 12, h, m, 0)

describe('parseCountdownSettings', () => {
  it('returns defaults when the map is empty or undefined', () => {
    const s = parseCountdownSettings(undefined)
    expect(s.enabled).toBe(true)
    expect(s.idleMinutes).toBe(3)
    expect(s.startMinutes).toBe(6 * 60)
    expect(s.targetMinutes).toBe(7 * 60 + 50)
    expect(s.offMinutes).toBe(8 * 60 + 30)
    expect(s.colorElapsed).toBe(DEFAULTS.colorElapsed)
    expect(s.colorRemaining).toBe(DEFAULTS.colorRemaining)
  })

  it('parses provided values', () => {
    const s = parseCountdownSettings({
      countdown_enabled: '0',
      countdown_idle_minutes: '5',
      countdown_start_time: '05:30',
      countdown_target_time: '08:00',
      countdown_off_time: '09:15',
      countdown_color_elapsed: '#123456',
      countdown_color_remaining: '#abcdef',
    })
    expect(s.enabled).toBe(false)
    expect(s.idleMinutes).toBe(5)
    expect(s.startMinutes).toBe(5 * 60 + 30)
    expect(s.targetMinutes).toBe(8 * 60)
    expect(s.offMinutes).toBe(9 * 60 + 15)
    expect(s.colorElapsed).toBe('#123456')
    expect(s.colorRemaining).toBe('#abcdef')
  })

  it('falls back to defaults for invalid values', () => {
    const s = parseCountdownSettings({
      countdown_idle_minutes: 'abc',
      countdown_start_time: '99:99',
      countdown_target_time: 'nope',
      countdown_color_elapsed: 'red',
    })
    expect(s.idleMinutes).toBe(3)
    expect(s.startMinutes).toBe(6 * 60)
    expect(s.targetMinutes).toBe(7 * 60 + 50)
    expect(s.colorElapsed).toBe(DEFAULTS.colorElapsed)
  })

  it('clamps idle minutes to at least 1', () => {
    expect(parseCountdownSettings({ countdown_idle_minutes: '0' }).idleMinutes).toBe(1)
    expect(parseCountdownSettings({ countdown_idle_minutes: '-4' }).idleMinutes).toBe(1)
  })
})

describe('computeCountdownState', () => {
  const s = parseCountdownSettings(undefined) // 06:00 / 07:50 / 08:30

  it('is inactive on weekends', () => {
    expect(computeCountdownState(s, satAt(7, 0)).phase).toBe('inactive')
  })

  it('is inactive before start and at/after off', () => {
    expect(computeCountdownState(s, wedAt(5, 59)).phase).toBe('inactive')
    expect(computeCountdownState(s, wedAt(8, 30)).phase).toBe('inactive')
    expect(computeCountdownState(s, wedAt(9, 0)).phase).toBe('inactive')
  })

  it('is inactive when disabled', () => {
    const off = { ...s, enabled: false }
    expect(computeCountdownState(off, wedAt(7, 0)).phase).toBe('inactive')
  })

  it('counts from start (0%) to target (approaching 100%)', () => {
    const atStart = computeCountdownState(s, wedAt(6, 0))
    expect(atStart.phase).toBe('counting')
    expect(atStart.elapsedFraction).toBeCloseTo(0, 5)
    expect(atStart.minutesLeft).toBe(110)

    const mid = computeCountdownState(s, wedAt(6, 55)) // 55 of 110 min
    expect(mid.phase).toBe('counting')
    expect(mid.elapsedFraction).toBeCloseTo(0.5, 2)
    expect(mid.minutesLeft).toBe(55)

    const near = computeCountdownState(s, wedAt(7, 49))
    expect(near.phase).toBe('counting')
    expect(near.minutesLeft).toBe(1)
  })

  it('is timesup at and after target until off', () => {
    const at = computeCountdownState(s, wedAt(7, 50))
    expect(at.phase).toBe('timesup')
    expect(at.elapsedFraction).toBe(1)
    expect(at.minutesLeft).toBe(0)
    expect(computeCountdownState(s, wedAt(8, 15)).phase).toBe('timesup')
  })

  it('guards against target <= start (no divide by zero)', () => {
    const bad = { ...s, startMinutes: 8 * 60, targetMinutes: 6 * 60 }
    // now inside a made-up window start..off; fraction must be finite
    const st = computeCountdownState({ ...bad, offMinutes: 9 * 60 }, wedAt(8, 30))
    expect(Number.isFinite(st.elapsedFraction)).toBe(true)
  })
})
