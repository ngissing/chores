// Durable "a stopwatch is running" state, so a run survives the overlay closing.
// We persist only the start timestamp (per member) in localStorage; elapsed is
// always computed as `now - startedAt`, so nothing drifts while it's backgrounded.

export const AUTO_STOP_MS = 2 * 60 * 60 * 1000 // 2 hours — forgotten-run safety cap

export function hasExpired(startedAt: number, now: number): boolean {
  return now - startedAt >= AUTO_STOP_MS
}

const keyFor = (memberId: number) => `sw_run_${memberId}`

export function readRunStart(memberId: number): number | null {
  try {
    const v = localStorage.getItem(keyFor(memberId))
    if (!v) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export function writeRunStart(memberId: number, startedAt: number): void {
  try {
    localStorage.setItem(keyFor(memberId), String(startedAt))
  } catch {
    // storage unavailable — the run just won't survive a close; not fatal
  }
}

export function clearRunStart(memberId: number): void {
  try {
    localStorage.removeItem(keyFor(memberId))
  } catch {
    // ignore
  }
}
