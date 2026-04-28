export function centsToDisplay(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function pointsToCents(points: number, pointValueCents: number): number {
  return points * pointValueCents
}
