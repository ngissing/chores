export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms))
  const minutes = Math.floor(total / 60000)
  const seconds = Math.floor((total % 60000) / 1000)
  const cs = Math.floor((total % 1000) / 10)
  const cc = String(cs).padStart(2, '0')
  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, '0')}.${cc}`
  }
  return `${seconds}.${cc}`
}

export function bestMs(runs: { duration_ms: number }[]): number | null {
  if (runs.length === 0) return null
  return runs.reduce((min, r) => (r.duration_ms < min ? r.duration_ms : min), runs[0].duration_ms)
}

export function isPersonalBest(ms: number, priorRuns: { duration_ms: number }[]): boolean {
  const best = bestMs(priorRuns)
  return best === null || ms < best
}
