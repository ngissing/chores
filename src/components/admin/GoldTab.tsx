'use client'
import { useState } from 'react'
import { useGoldChores } from '@/hooks/useGoldChores'
import type { GoldChore } from '@/hooks/useGoldChores'

type GoldForm = { name: string; points: number }

export default function GoldTab() {
  const { allGoldChores, mutate } = useGoldChores()
  const [form, setForm] = useState<GoldForm | null>(null)

  const available = allGoldChores.filter((c) => c.status === 'available')
  const awarded   = allGoldChores.filter((c) => c.status === 'awarded')

  const triggerGeneration = (id: number, name: string) => {
    fetch('/api/generate-gold-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gold_chore_id: id, chore_name: name }),
    })
    setTimeout(() => mutate(), 500)
  }

  const save = async () => {
    if (!form) return
    const res = await fetch('/api/gold-chores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const created = await res.json() as GoldChore
    setForm(null)
    mutate()
    if (created?.id) {
      triggerGeneration(created.id, created.name)
    }
  }

  const del = async (id: number) => {
    if (!confirm('Delete this gold chore?')) return
    await fetch('/api/gold-chores/' + id, { method: 'DELETE' })
    mutate()
  }

  const regen = (c: GoldChore) => {
    triggerGeneration(c.id, c.name)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'var(--font-fredoka)' }}>
          ⭐ Gold Chores
        </h2>
        <button
          type="button"
          onClick={() => setForm({ name: '', points: 10 })}
          className="px-4 py-2 rounded-xl text-sm font-bold text-white"
          style={{ background: '#b45309' }}
        >
          + Add Gold Chore
        </button>
      </div>

      {/* Active gold chores */}
      {available.length === 0 && (
        <div className="text-white/30 text-sm">No active gold chores. Add one above.</div>
      )}

      {available.map((c) => (
        <GoldChoreRow key={c.id} chore={c} onRegen={regen} onDelete={del} />
      ))}

      {/* Awarded history */}
      {awarded.length > 0 && (
        <details className="mt-4">
          <summary className="text-white/40 text-sm cursor-pointer select-none">
            Awarded history ({awarded.length})
          </summary>
          <div className="flex flex-col gap-2 mt-2">
            {awarded.map((c) => (
              <div key={c.id}
                className="flex items-center gap-3 p-3 rounded-2xl"
                style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-white/10">
                  {c.image_status === 'ready' && c.image_path
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={c.image_path} alt={c.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-sm">⭐</div>}
                </div>
                <div className="flex-1">
                  <div className="font-bold text-white/60 text-sm">{c.name}</div>
                  <div className="text-xs text-white/30">
                    {c.points}pt · awarded {c.awarded_at ? new Date(c.awarded_at).toLocaleDateString() : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Create modal */}
      {form && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50">
          <div className="flex flex-col gap-3 p-6 rounded-3xl w-80"
            style={{ background: '#1a1a2e', border: '2px solid #f59e0b' }}>
            <h3 className="text-lg font-bold text-amber-400">New Gold Chore</h3>
            <input
              type="text"
              placeholder="Chore name"
              value={form.name}
              onChange={(e) => setForm((p) => p && ({ ...p, name: e.target.value }))}
              className="px-3 py-2 rounded-xl bg-white/10 text-white outline-none border border-white/10"
            />
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Points</label>
              <input
                type="number"
                min={1}
                value={form.points}
                onChange={(e) => setForm((p) => p && ({ ...p, points: Number(e.target.value) }))}
                className="px-3 py-2 rounded-xl bg-white/10 text-white outline-none border border-white/10"
              />
            </div>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white/50"
                style={{ background: 'rgba(255,255,255,0.08)' }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white"
                style={{ background: '#b45309' }}
                disabled={!form.name.trim()}>
                Save & Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function GoldChoreRow({
  chore,
  onRegen,
  onDelete,
}: {
  chore: GoldChore
  onRegen: (c: GoldChore) => void
  onDelete: (id: number) => void
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}>
      <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-white/10">
        {chore.image_status === 'ready' && chore.image_path
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={chore.image_path} alt={chore.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-lg">
              {chore.image_status === 'failed' ? '⚠️' : '⏳'}
            </div>}
      </div>
      <div className="flex-1">
        <div className="font-bold text-white text-sm">{chore.name}</div>
        <div className="text-xs text-amber-400/70">⭐ {chore.points} pts</div>
      </div>
      <button
        type="button"
        onClick={() => onRegen(chore)}
        className="px-2 py-1 rounded-lg text-xs font-bold"
        style={{
          background: chore.image_status === 'failed' ? 'rgba(234,179,8,0.1)' : 'rgba(255,255,255,0.06)',
          color: chore.image_status === 'failed' ? '#facc15' : 'rgba(255,255,255,0.4)',
        }}>
        {chore.image_status === 'failed' ? 'Retry' : '↻'}
      </button>
      <button
        type="button"
        onClick={() => onDelete(chore.id)}
        className="px-3 py-1 rounded-lg text-xs font-bold text-red-400"
        style={{ background: 'rgba(239,68,68,0.1)' }}>
        Del
      </button>
    </div>
  )
}
