'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { useMembers } from '@/hooks/useMembers'
import { useChores } from '@/hooks/useChores'
import { usePoints } from '@/hooks/usePoints'
import { useRoutine } from '@/hooks/useRoutine'
import MemberSelector from '@/components/MemberSelector'
import ChoreGrid from '@/components/ChoreGrid'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function HomePage() {
  const router = useRouter()
  const { members } = useMembers()
  const [activeMemberId, setActiveMemberId] = useState<number | null>(null)
  const { data: settings } = useSWR<Record<string, string>>('/api/settings', fetcher)
  const routine = useRoutine(settings?.afternoon_start_time ?? '12:00')
  const today = new Date().toISOString().slice(0, 10)
  const { chores, completedIds, mutateCompletions } = useChores(activeMemberId, routine, today)
  const points = usePoints(activeMemberId)

  // Auto-select first member on load
  useEffect(() => {
    if (members.length > 0 && activeMemberId === null) {
      setActiveMemberId(members[0].id)
    }
  }, [members, activeMemberId])

  const activeMember = members.find((m) => m.id === activeMemberId)
  const accentColour = activeMember?.colour ?? '#6366f1'

  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set())

  const handleToggle = async (choreId: number) => {
    if (!activeMemberId || pendingIds.has(choreId)) return
    setPendingIds((s) => new Set(s).add(choreId))
    try {
      const isCompleted = completedIds.has(choreId)
      await fetch('/api/completions', {
        method: isCompleted ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chore_id: choreId, member_id: activeMemberId }),
      })
      if (!isCompleted) {
        const res = await fetch('/api/completions/check-streak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ member_id: activeMemberId }),
        })
        if (res.ok) {
          const { all_done } = await res.json()
          if (all_done) {
            const { default: confetti } = await import('canvas-confetti')
            confetti({ particleCount: 200, spread: 90, origin: { y: 0.6 } })
          }
        }
      }
    } finally {
      setPendingIds((s) => { const n = new Set(s); n.delete(choreId); return n })
      mutateCompletions()
      points.mutate()
    }
  }

  const routineLabel = routine === 'morning' ? '☀️ MORNING' : '🌙 AFTERNOON'
  const dateLabel = new Date().toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

  return (
    <div
      className="w-screen h-screen flex flex-col overflow-hidden transition-colors duration-500"
      style={{ background: `${accentColour}18`, position: 'relative' }}
    >
      {/* Radial glow from top */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 80% 40% at 50% 0%, ${accentColour}28, transparent 70%)`,
          zIndex: 0,
        }}
      />

      {/* Top bar — finance info + settings */}
      <div
        className="relative z-10 flex items-center gap-3 px-4 flex-shrink-0"
        style={{
          background: 'rgba(0,0,0,0.4)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          minHeight: '4rem',
        }}
      >
        {/* Logo + routine */}
        <span className="font-bold text-lg" style={{ fontFamily: 'var(--font-fredoka)', color: accentColour }}>
          ⭐ ChoreChart
        </span>
        <span className="text-xs font-bold px-2 py-1 rounded-full text-white"
          style={{ background: `${accentColour}33` }}>
          {routineLabel}
        </span>

        <div className="flex-1" />

        {/* Cash-in button */}
        <button
          onClick={() => activeMemberId && points.unallocated > 0 && router.push(`/cashin/${activeMemberId}`)}
          disabled={points.unallocated === 0}
          className="flex flex-col items-center transition-opacity active:scale-95"
          style={{ opacity: points.unallocated > 0 ? 1 : 0.35 }}
        >
          <span className="font-bold leading-tight" style={{ fontFamily: 'var(--font-fredoka)', color: accentColour, fontSize: '1.6rem' }}>
            {points.unallocatedDisplay}
          </span>
          <span className="text-white/40" style={{ fontSize: '0.65rem' }}>
            {points.unallocated > 0 ? 'tap to cash in' : 'unallocated'}
          </span>
        </button>

        <div style={{ width: '1px', height: '2rem', background: 'rgba(255,255,255,0.1)' }} />

        {/* Bucket totals */}
        <div className="flex gap-3">
          {[
            { label: '🛍️', val: points.spendDisplay, col: '#fb923c' },
            { label: '🏦', val: points.saveDisplay, col: '#60a5fa' },
            { label: '🤝', val: points.giveDisplay, col: '#4ade80' },
          ].map(({ label, val, col }) => (
            <div key={label} className="flex flex-col items-center">
              <div className="font-bold" style={{ color: col, fontSize: '1rem' }}>{val}</div>
              <div className="text-white/40" style={{ fontSize: '0.6rem' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Streak */}
        {(activeMember?.streak_days ?? 0) > 1 && (
          <span className="font-bold text-orange-400 text-sm">🔥{activeMember!.streak_days}</span>
        )}

        {/* Settings gear */}
        <button onClick={() => router.push('/admin')}
          className="text-white/30 hover:text-white/70 transition-colors"
          style={{ fontSize: '1.5rem', padding: '0.4rem' }}>
          ⚙
        </button>
      </div>

      {/* When-Then motivational prompt */}
      {activeMember && completedIds.size === 0 && chores.length > 0 && (
        <div className="relative z-10 text-center text-sm py-1 text-white/40 italic">
          When you finish your chores, you will earn{' '}
          <span style={{ color: accentColour }}>{chores.reduce((s, c) => s + c.points, 0)} pts</span>!
        </div>
      )}

      {/* Chore grid — fills remaining space */}
      <div className="relative z-10 flex-1 min-h-0 flex flex-col">
        <ChoreGrid
          chores={chores}
          completedIds={completedIds}
          accentColour={accentColour}
          pendingIds={pendingIds}
          onToggle={handleToggle}
        />
      </div>

      {/* Bottom bar — member selector */}
      <div className="relative z-10">
        <MemberSelector
          members={members}
          activeMemberId={activeMemberId}
          onSelect={setActiveMemberId}
        />
      </div>
    </div>
  )
}
