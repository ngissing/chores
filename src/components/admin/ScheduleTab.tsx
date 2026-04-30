'use client'
import { useState } from 'react'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function ScheduleTab() {
  const { data: settings, mutate } = useSWR<Record<string,string>>('/api/settings', fetcher)
  const [form, setForm] = useState<Record<string,string> | null>(null)

  const current = form ?? settings ?? {}

  const save = async () => {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(current),
    })
    mutate()
    setForm(null)
  }

  const fields = [
    { key: 'morning_start_time',   label: 'Morning starts', icon: '☀️' },
    { key: 'afternoon_start_time', label: 'Afternoon starts', icon: '🌙' },
    { key: 'daily_reset_time',     label: 'Daily reset', icon: '🔄' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'var(--font-fredoka)' }}>Schedule</h2>
      {fields.map(({ key, label, icon }) => (
        <div key={key} className="flex flex-col gap-1">
          <label className="text-sm text-white/60 font-bold">{icon} {label}</label>
          <input
            type="time"
            value={current[key] ?? ''}
            onChange={(e) => setForm((f) => ({ ...(f ?? settings ?? {}), [key]: e.target.value }))}
            className="px-4 py-3 rounded-xl bg-white/10 text-white outline-none border border-white/10 text-lg w-40"
          />
        </div>
      ))}
      <div className="flex items-center gap-3 mt-2 p-4 rounded-2xl"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {fields.map(({ key, icon }) => (
          <div key={key} className="flex-1 text-center">
            <div className="text-2xl">{icon}</div>
            <div className="text-xs text-white/40 mt-1">{current[key] ?? '--:--'}</div>
          </div>
        ))}
      </div>
      <button onClick={save}
        className="px-6 py-3 rounded-xl text-sm font-bold text-white w-40"
        style={{ background: '#6366f1' }}>
        Save
      </button>
    </div>
  )
}
