'use client'
import { useState } from 'react'
import { useMembers, type Member } from '@/hooks/useMembers'

export default function MembersTab() {
  const { members, mutate } = useMembers()
  const [editing, setEditing] = useState<Partial<Member> & { id?: number } | null>(null)

  const save = async () => {
    if (!editing) return
    const method = editing.id ? 'PUT' : 'POST'
    await fetch('/api/members', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    })
    mutate()
    setEditing(null)
  }

  const del = async (id: number) => {
    if (!confirm('Delete this member?')) return
    await fetch('/api/members', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    mutate()
  }

  const uploadPhoto = async (memberId: number, file: File) => {
    const fd = new FormData()
    fd.append('photo', file)
    fd.append('member_id', String(memberId))
    await fetch('/api/upload-photo', { method: 'POST', body: fd })
    mutate()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'var(--font-fredoka)' }}>Members</h2>
        <button
          onClick={() => setEditing({ name: '', age: 5, colour: '#6366f1', point_value_cents: 10 })}
          className="px-4 py-2 rounded-xl text-sm font-bold text-white"
          style={{ background: '#6366f1' }}>
          + Add Member
        </button>
      </div>

      {members.map((m) => (
        <div key={m.id} className="flex items-center gap-3 p-3 rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${m.colour}44` }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold"
            style={{ background: m.colour }}>
            {m.photo_path
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={m.photo_path} alt={m.name} className="w-full h-full rounded-full object-cover" />
              : <span className="text-white">{m.name[0]}</span>}
          </div>
          <div className="flex-1">
            <div className="font-bold text-white">{m.name}</div>
            <div className="text-xs text-white/50">Age {m.age} · ${(m.point_value_cents / 100).toFixed(2)}/pt</div>
          </div>
          <label className="px-2 py-1 rounded-lg text-xs font-bold text-white/60 cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.08)' }}>
            📷
            <input type="file" accept="image/*" className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadPhoto(m.id, e.target.files[0])} />
          </label>
          <button onClick={() => setEditing(m)}
            className="px-3 py-1 rounded-lg text-xs font-bold text-white/60"
            style={{ background: 'rgba(255,255,255,0.08)' }}>Edit</button>
          <button onClick={() => del(m.id)}
            className="px-3 py-1 rounded-lg text-xs font-bold text-red-400"
            style={{ background: 'rgba(239,68,68,0.1)' }}>Del</button>
        </div>
      ))}

      {editing && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50">
          <div className="flex flex-col gap-3 p-6 rounded-3xl w-80"
            style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 className="text-lg font-bold text-white">{editing.id ? 'Edit' : 'Add'} Member</h3>
            {[
              { label: 'Name', key: 'name', type: 'text' },
              { label: 'Age',  key: 'age',  type: 'number' },
            ].map(({ label, key, type }) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-xs text-white/50">{label}</label>
                <input type={type} value={(editing as Record<string, unknown>)[key] as string ?? ''}
                  onChange={(e) => setEditing((prev) => ({ ...prev, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
                  className="px-3 py-2 rounded-xl bg-white/10 text-white outline-none border border-white/10" />
              </div>
            ))}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Colour</label>
              <input type="color" value={editing.colour ?? '#6366f1'}
                onChange={(e) => setEditing((p) => ({ ...p, colour: e.target.value }))}
                className="w-full h-10 rounded-xl cursor-pointer" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50">Cents per point (e.g. 10 = $0.10)</label>
              <input type="number" value={editing.point_value_cents ?? 10}
                onChange={(e) => setEditing((p) => ({ ...p, point_value_cents: Number(e.target.value) }))}
                className="px-3 py-2 rounded-xl bg-white/10 text-white outline-none border border-white/10" />
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
