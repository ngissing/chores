'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { useMembers } from '@/hooks/useMembers'
import type { Chore } from '@/hooks/useChores'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type ChoreForm = {
  id?: number; name: string; points: number
  routine: 'morning' | 'afternoon' | 'both'; member_ids: number[]
}

export default function ChoresTab() {
  const { data: chores, mutate } = useSWR<Chore[]>('/api/chores', fetcher)
  const { members } = useMembers()
  const [editing, setEditing] = useState<ChoreForm | null>(null)

  const save = async () => {
    if (!editing) return
    const isNew = !editing.id
    await fetch('/api/chores', {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    })
    mutate()
    if (isNew) {
      const updated = await fetch('/api/chores').then((r) => r.json()) as Chore[]
      const newest = updated[updated.length - 1]
      if (newest) {
        fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chore_id: newest.id, chore_name: newest.name }),
        })
      }
    }
    setEditing(null)
  }

  const del = async (id: number) => {
    if (!confirm('Delete this chore?')) return
    await fetch('/api/chores', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    mutate()
  }

  const retryImage = (c: Chore) => {
    fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chore_id: c.id, chore_name: c.name }),
    }).then(() => mutate())
  }

  const toggleMember = (mid: number) =>
    setEditing((prev) => {
      if (!prev) return prev
      const ids = prev.member_ids.includes(mid)
        ? prev.member_ids.filter((x) => x !== mid)
        : [...prev.member_ids, mid]
      return { ...prev, member_ids: ids }
    })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'var(--font-fredoka)' }}>Chores</h2>
        <button
          onClick={() => setEditing({ name: '', points: 1, routine: 'morning', member_ids: [] })}
          className="px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: '#6366f1' }}>
          + Add Chore
        </button>
      </div>

      {(chores ?? []).map((c) => (
        <div key={c.id} className="flex items-center gap-3 p-3 rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-white/10">
            {c.image_status === 'ready' && c.image_path
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={c.image_path} alt={c.name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-lg">
                  {c.image_status === 'failed' ? '⚠️' : '⏳'}
                </div>}
          </div>
          <div className="flex-1">
            <div className="font-bold text-white text-sm">{c.name}</div>
            <div className="text-xs text-white/50">{c.routine} · {c.points}pt</div>
          </div>
          {c.image_status === 'failed' && (
            <button onClick={() => retryImage(c)}
              className="px-2 py-1 rounded-lg text-xs font-bold text-yellow-400"
              style={{ background: 'rgba(234,179,8,0.1)' }}>Retry</button>
          )}
          <button onClick={() => setEditing({ id: c.id, name: c.name, points: c.points, routine: c.routine, member_ids: c.member_ids })}
            className="px-3 py-1 rounded-lg text-xs font-bold text-white/60"
            style={{ background: 'rgba(255,255,255,0.08)' }}>Edit</button>
          <button onClick={() => del(c.id)}
            className="px-3 py-1 rounded-lg text-xs font-bold text-red-400"
            style={{ background: 'rgba(239,68,68,0.1)' }}>Del</button>
        </div>
      ))}

      {editing && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50">
          <div className="flex flex-col gap-3 p-6 rounded-3xl w-80"
            style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 className="text-lg font-bold text-white">{editing.id ? 'Edit' : 'Add'} Chore</h3>
            <input type="text" placeholder="Chore name" value={editing.name}
              onChange={(e) => setEditing((p) => p && ({ ...p, name: e.target.value }))}
              className="px-3 py-2 rounded-xl bg-white/10 text-white outline-none border border-white/10" />
            <div className="flex gap-2">
              {(['morning','afternoon','both'] as const).map((r) => (
                <button key={r} onClick={() => setEditing((p) => p && ({ ...p, routine: r }))}
                  className="flex-1 py-2 rounded-xl text-xs font-bold capitalize"
                  style={{
                    background: editing.routine === r ? '#6366f1' : 'rgba(255,255,255,0.08)',
                    color: editing.routine === r ? 'white' : 'rgba(255,255,255,0.5)',
                  }}>
                  {r}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Points</label>
              <input type="number" min={1} value={editing.points}
                onChange={(e) => setEditing((p) => p && ({ ...p, points: Number(e.target.value) }))}
                className="px-3 py-2 rounded-xl bg-white/10 text-white outline-none border border-white/10" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Assign to</label>
              <div className="flex gap-2 flex-wrap">
                {members.map((m) => (
                  <button key={m.id} onClick={() => toggleMember(m.id)}
                    className="px-3 py-1 rounded-xl text-xs font-bold"
                    style={{
                      background: editing.member_ids.includes(m.id) ? m.colour : 'rgba(255,255,255,0.08)',
                      color: editing.member_ids.includes(m.id) ? 'white' : 'rgba(255,255,255,0.5)',
                    }}>
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => setEditing(null)}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white/50"
                style={{ background: 'rgba(255,255,255,0.08)' }}>Cancel</button>
              <button onClick={save}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white"
                style={{ background: '#6366f1' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
