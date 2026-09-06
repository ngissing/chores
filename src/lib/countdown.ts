export interface CountdownSettings {
  enabled: boolean
  idleMinutes: number
  startMinutes: number
  targetMinutes: number
  offMinutes: number
  colorElapsed: string
  colorRemaining: string
}

export type CountdownPhase = 'inactive' | 'counting' | 'timesup'

export interface CountdownState {
  phase: CountdownPhase
  elapsedFraction: number
  minutesLeft: number
}

export const DEFAULTS = {
  enabled: true,
  idleMinutes: 3,
  startMinutes: 6 * 60,
  targetMinutes: 7 * 60 + 50,
  offMinutes: 8 * 60 + 30,
  colorElapsed: '#E8956A',
  colorRemaining: '#2FB187',
}

function parseTime(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return fallback
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return fallback
  return h * 60 + min
}

function parseColor(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : fallback
}

export function parseCountdownSettings(raw: Record<string, string> | undefined): CountdownSettings {
  const r = raw ?? {}
  const idle = Math.floor(Number(r.countdown_idle_minutes))
  return {
    enabled: r.countdown_enabled !== '0',
    idleMinutes: Number.isFinite(idle) ? Math.max(1, idle) : DEFAULTS.idleMinutes,
    startMinutes: parseTime(r.countdown_start_time, DEFAULTS.startMinutes),
    targetMinutes: parseTime(r.countdown_target_time, DEFAULTS.targetMinutes),
    offMinutes: parseTime(r.countdown_off_time, DEFAULTS.offMinutes),
    colorElapsed: parseColor(r.countdown_color_elapsed, DEFAULTS.colorElapsed),
    colorRemaining: parseColor(r.countdown_color_remaining, DEFAULTS.colorRemaining),
  }
}

export function computeCountdownState(s: CountdownSettings, now: Date): CountdownState {
  const inactive: CountdownState = { phase: 'inactive', elapsedFraction: 0, minutesLeft: 0 }
  if (!s.enabled) return inactive

  const day = now.getDay()
  if (day === 0 || day === 6) return inactive

  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
  if (nowMin < s.startMinutes || nowMin >= s.offMinutes) return inactive

  if (nowMin >= s.targetMinutes) {
    return { phase: 'timesup', elapsedFraction: 1, minutesLeft: 0 }
  }

  const span = s.targetMinutes - s.startMinutes
  const fraction = span > 0 ? Math.min(1, Math.max(0, (nowMin - s.startMinutes) / span)) : 1
  const minutesLeft = Math.max(0, Math.ceil(s.targetMinutes - nowMin))
  return { phase: 'counting', elapsedFraction: fraction, minutesLeft }
}
