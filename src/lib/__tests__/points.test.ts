import { centsToDisplay, pointsToCents } from '../points'

test('centsToDisplay formats cents as dollars', () => {
  expect(centsToDisplay(0)).toBe('$0.00')
  expect(centsToDisplay(305)).toBe('$3.05')
  expect(centsToDisplay(1000)).toBe('$10.00')
})

test('pointsToCents converts points to cents', () => {
  expect(pointsToCents(10, 10)).toBe(100)
  expect(pointsToCents(3, 5)).toBe(15)
})
