import { computeGridLayout } from '../grid'

test('1 chore → 1 col, 1 row', () => {
  expect(computeGridLayout(1)).toEqual({ cols: 1, rows: 1 })
})

test('5 chores → 5 cols, 1 row', () => {
  expect(computeGridLayout(5)).toEqual({ cols: 5, rows: 1 })
})

test('6 chores → 3 cols, 2 rows', () => {
  expect(computeGridLayout(6)).toEqual({ cols: 3, rows: 2 })
})

test('15 chores → 5 cols, 3 rows', () => {
  expect(computeGridLayout(15)).toEqual({ cols: 5, rows: 3 })
})

test('0 chores → 1 col, 1 row (safe fallback)', () => {
  expect(computeGridLayout(0)).toEqual({ cols: 1, rows: 1 })
})
