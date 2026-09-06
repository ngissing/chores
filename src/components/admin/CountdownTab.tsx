'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { parseCountdownSettings } from '@/lib/countdown'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function CountdownTab() {
  const { data: settings, mutate } = useSWR<Record<string, string>>('/api/settings', fetcher)
  const [form, setForm] = useState<Record<string, string> | null>(null)
  const current = form ?? settings ?? {}

  const set = (key: string, value: string) =>
    setForm((f) => ({ ...(f ?? settings ?? {}), [key]: value }))

  const save = async () => {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(current),
    })
    mutate()
    setForm(null)
  }

  const cd = parseCountdownSettings(current)
  const enabled = (current.countdown_enabled ?? '1') !== '0'
  const previewFraction = 0.55 // sample for the swatch preview

  const times: { key: string; label: string; fallback: string }[] = [
    { key: 'countdown_start_time', label: '☀️ Start', fallback: '06:00' },
    { key: 'countdown_target_time', label: '🎯 Count down to', fallback: '07:50' },
    { key: 'countdown_off_time', label: '🌙 Turn off after', fallback: '08:30' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'var(--font-fredoka)' }}>
        Countdown clock
      </h2>

      <label className="flex items-center gap-3 text-white/80 font-bold text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => set('countdown_enabled', e.target.checked ? '1' : '0')}
          style={{ width: 20, height: 20 }}
        />
        Show the morning countdown overlay
      </label>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-white/60 font-bold">⏳ Appear after (minutes idle)</label>
        <input
          type="number"
          min={1}
          value={current.countdown_idle_minutes ?? '3'}
          onChange={(e) => set('countdown_idle_minutes', e.target.value)}
          className="px-4 py-3 rounded-xl bg-white/10 text-white outline-none border border-white/10 text-lg w-40"
        />
      </div>

      {times.map(({ key, label, fallback }) => (
        <div key={key} className="flex flex-col gap-1">
          <label className="text-sm text-white/60 font-bold">{label}</label>
          <input
            type="time"
            value={current[key] ?? fallback}
            onChange={(e) => set(key, e.target.value)}
            className="px-4 py-3 rounded-xl bg-white/10 text-white outline-none border border-white/10 text-lg w-40"
          />
        </div>
      ))}

      <div className="flex gap-6">
        <div className="flex flex-col gap-1">
          <label className="text-sm text-white/60 font-bold">Time gone</label>
          <input type="color" value={cd.colorElapsed}
            onChange={(e) => set('countdown_color_elapsed', e.target.value)}
            className="w-16 h-12 rounded-lg bg-transparent border border-white/10" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm text-white/60 font-bold">Time left</label>
          <input type="color" value={cd.colorRemaining}
            onChange={(e) => set('countdown_color_remaining', e.target.value)}
            className="w-16 h-12 rounded-lg bg-transparent border border-white/10" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <label className="text-sm text-white/60 font-bold">Preview</label>
          <svg width="48" height="48" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="22" fill={cd.colorRemaining} />
            <path
              d={(() => {
                const a = 2 * Math.PI * previewFraction
                const x = 24 + 22 * Math.sin(a)
                const y = 24 - 22 * Math.cos(a)
                const large = previewFraction > 0.5 ? 1 : 0
                return `M 24 24 L 24 2 A 22 22 0 ${large} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`
              })()}
              fill={cd.colorElapsed}
            />
          </svg>
        </div>
      </div>

      <button onClick={save}
        className="px-6 py-3 rounded-xl text-sm font-bold text-white w-40"
        style={{ background: '#6366f1' }}>
        Save
      </button>
    </div>
  )
}
