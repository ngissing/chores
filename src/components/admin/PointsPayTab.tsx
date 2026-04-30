'use client'
import { useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { useMembers } from '@/hooks/useMembers'
import { centsToDisplay } from '@/lib/points'
import type { Member } from '@/hooks/useMembers'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type RatioEntry = { member_id: number; name: string; completed: number; possible: number; rate: number }
type BalanceEntry = { bucket: string; balance_cents: number }

export default function PointsPayTab() {
  const { members } = useMembers()
  const [addForm, setAddForm] = useState<{ member_id: number; bucket: string; amount: string } | null>(null)
  const [ratioDays, setRatioDays] = useState(7)
  const { data: ratios } = useSWR<RatioEntry[]>(`/api/completions/ratio?days=${ratioDays}`, fetcher, { refreshInterval: 30000 })
  const { mutate: globalMutate } = useSWRConfig()

  const payout = async (memberId: number) => {
    if (!confirm('Mark as paid? This will zero all balances.')) return
    await fetch('/api/points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'payout', member_id: memberId }),
    })
    globalMutate(`/api/points?member_id=${memberId}`)
  }

  const adminAdd = async () => {
    if (!addForm) return
    await fetch('/api/points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'admin_add',
        member_id: addForm.member_id,
        bucket: addForm.bucket,
        amount_cents: Math.round(parseFloat(addForm.amount) * 100),
      }),
    })
    globalMutate(`/api/points?member_id=${addForm.member_id}`)
    setAddForm(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'var(--font-fredoka)' }}>Points & Pay</h2>
      <p className="text-xs text-white/40">Kids choose their own Spend / Save / Give split.</p>

      {members.map((m) => (
        <MemberBalanceRow
          key={m.id} member={m}
          onPayout={() => payout(m.id)}
          onAdminAdd={() => setAddForm({ member_id: m.id, bucket: 'spend', amount: '' })}
        />
      ))}

      {/* Completion ratio */}
      <div className="mt-4">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="font-bold text-white">Completion Ratio</h3>
          {[7, 30].map((d) => (
            <button key={d} onClick={() => setRatioDays(d)}
              className="px-3 py-1 rounded-lg text-xs font-bold"
              style={{
                background: ratioDays === d ? '#6366f1' : 'rgba(255,255,255,0.08)',
                color: ratioDays === d ? 'white' : 'rgba(255,255,255,0.5)',
              }}>
              {d}d
            </button>
          ))}
        </div>
        {(ratios ?? []).map((r) => (
          <div key={r.member_id} className="flex items-center gap-3 mb-2">
            <div className="text-sm text-white/80 w-20">{r.name}</div>
            <div className="flex-1 h-3 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{ width: `${r.rate}%`, background: r.rate >= 80 ? '#4ade80' : r.rate >= 50 ? '#fb923c' : '#ef4444' }} />
            </div>
            <div className="text-xs text-white/50 w-10 text-right">{r.rate}%</div>
          </div>
        ))}
      </div>

      {/* Admin add modal */}
      {addForm && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50">
          <div className="flex flex-col gap-3 p-6 rounded-3xl w-72"
            style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 className="font-bold text-white">Manual Add</h3>
            <div className="flex gap-2">
              {['spend','save','give'].map((b) => (
                <button key={b} onClick={() => setAddForm((f) => f && ({ ...f, bucket: b }))}
                  className="flex-1 py-2 rounded-xl text-xs font-bold capitalize"
                  style={{
                    background: addForm.bucket === b ? '#6366f1' : 'rgba(255,255,255,0.08)',
                    color: addForm.bucket === b ? 'white' : 'rgba(255,255,255,0.5)',
                  }}>
                  {b}
                </button>
              ))}
            </div>
            <input type="number" step="0.01" placeholder="Amount ($)"
              value={addForm.amount}
              onChange={(e) => setAddForm((f) => f && ({ ...f, amount: e.target.value }))}
              className="px-3 py-2 rounded-xl bg-white/10 text-white outline-none border border-white/10" />
            <div className="flex gap-2 mt-1">
              <button onClick={() => setAddForm(null)}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white/50"
                style={{ background: 'rgba(255,255,255,0.08)' }}>Cancel</button>
              <button onClick={adminAdd}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white"
                style={{ background: '#6366f1' }}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MemberBalanceRow({
  member, onPayout, onAdminAdd,
}: { member: Member; onPayout: () => void; onAdminAdd: () => void }) {
  const { data } = useSWR<BalanceEntry[]>(`/api/points?member_id=${member.id}`,
    (url: string) => fetch(url).then((r) => r.json()), { refreshInterval: 5000 })
  const get = (b: string) => (data ?? []).find((x) => x.bucket === b)?.balance_cents ?? 0

  return (
    <div className="p-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${member.colour}33` }}>
      <div className="flex items-center justify-between mb-3">
        <span className="font-bold text-white" style={{ color: member.colour }}>{member.name}</span>
        <div className="flex gap-2">
          <button onClick={onAdminAdd}
            className="px-3 py-1 rounded-lg text-xs font-bold text-white/60"
            style={{ background: 'rgba(255,255,255,0.08)' }}>+ Add</button>
          <button onClick={onPayout}
            className="px-3 py-1 rounded-lg text-xs font-bold text-green-400"
            style={{ background: 'rgba(74,222,128,0.1)' }}>Mark Paid</button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        {(['unallocated','spend','save','give'] as const).map((b, idx) => {
          const icons = ['🎯','🛍️','🏦','🤝']
          const cols = ['#a78bfa','#fb923c','#60a5fa','#4ade80']
          return (
            <div key={b}>
              <div className="text-base">{icons[idx]}</div>
              <div className="font-bold" style={{ color: cols[idx] }}>{centsToDisplay(get(b))}</div>
              <div className="text-white/40 capitalize">{b}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
