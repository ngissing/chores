export interface GridLayout {
  cols: number
  rows: number
}

/**
 * Given a chore count, returns the smallest (cols × rows) grid
 * where rows ≤ 3 and cols ≤ 5 that fits all chores.
 */
export function computeGridLayout(count: number): GridLayout {
  const n = Math.max(1, count)
  for (let rows = 1; rows <= 3; rows++) {
    const cols = Math.ceil(n / rows)
    if (cols <= 5) return { cols, rows }
  }
  return { cols: 5, rows: 3 }
}
