import { isDayEnabled } from '../chores'

test('isDayEnabled returns true for all days when mask is 127', () => {
  for (let dow = 0; dow <= 6; dow++) {
    expect(isDayEnabled(127, dow)).toBe(true)
  }
})

test('isDayEnabled Friday-only mask (32 = 0b0100000) enables only Friday', () => {
  const fridayOnly = 32 // bit 5
  expect(isDayEnabled(fridayOnly, 5)).toBe(true) // Friday
  expect(isDayEnabled(fridayOnly, 0)).toBe(false) // Sunday
  expect(isDayEnabled(fridayOnly, 1)).toBe(false) // Monday
  expect(isDayEnabled(fridayOnly, 4)).toBe(false) // Thursday
  expect(isDayEnabled(fridayOnly, 6)).toBe(false) // Saturday
})

test('isDayEnabled weekdays-only mask (62 = 0b0111110) excludes weekends', () => {
  const weekdays = 62 // Mon=1 Tue=2 Wed=3 Thu=4 Fri=5 → bits 1-5
  expect(isDayEnabled(weekdays, 0)).toBe(false) // Sunday
  expect(isDayEnabled(weekdays, 1)).toBe(true) // Monday
  expect(isDayEnabled(weekdays, 2)).toBe(true) // Tuesday
  expect(isDayEnabled(weekdays, 3)).toBe(true) // Wednesday
  expect(isDayEnabled(weekdays, 4)).toBe(true) // Thursday
  expect(isDayEnabled(weekdays, 5)).toBe(true) // Friday
  expect(isDayEnabled(weekdays, 6)).toBe(false) // Saturday
})

test('isDayEnabled weekend-only mask (65 = 0b1000001) enables Sat and Sun only', () => {
  const weekends = 65 // bit 0 (Sun) + bit 6 (Sat)
  expect(isDayEnabled(weekends, 0)).toBe(true) // Sunday
  expect(isDayEnabled(weekends, 1)).toBe(false) // Monday
  expect(isDayEnabled(weekends, 5)).toBe(false) // Friday
  expect(isDayEnabled(weekends, 6)).toBe(true) // Saturday
})
