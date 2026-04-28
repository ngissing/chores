'use client'
import { useRouter } from 'next/navigation'

interface Props {
  memberId: number | null
  unallocatedDisplay: string
  unallocatedCents: number
  spendDisplay: string
  saveDisplay: string
  giveDisplay: string
  accentColour: string
  streakDays: number
}

export default function BottomBar({
  memberId,
  unallocatedDisplay,
  unallocatedCents,
  spendDisplay,
  saveDisplay,
  giveDisplay,
  accentColour,
  streakDays,
}: Props) {
  const router = useRouter()

  return (
    <div
      className="flex items-center gap-4 px-4 py-2 flex-shrink-0"
      style={{
        background: 'rgba(0,0,0,0.35)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Unallocated points — tap to cash in */}
      <button
        onClick={() => memberId && unallocatedCents > 0 && router.push(`/cashin/${memberId}`)}
        disabled={unallocatedCents === 0}
        className="flex flex-col items-start transition-opacity"
        style={{ opacity: unallocatedCents > 0 ? 1 : 0.4 }}
      >
        <span
          className="text-2xl font-bold leading-tight"
          style={{ fontFamily: 'var(--font-fredoka)', color: accentColour }}
        >
          {unallocatedDisplay}
        </span>
        <span className="text-xs text-white/40">
          {unallocatedCents > 0 ? 'tap to cash in' : 'unallocated'}
        </span>
      </button>

      {/* Streak badge */}
      {streakDays > 1 && (
        <div className="flex items-center gap-1 text-sm font-bold text-orange-400">
          🔥 {streakDays}
        </div>
      )}

      <div className="flex-1" />

      {/* Bucket balances */}
      <div className="flex gap-4 text-sm">
        {[
          { label: '🛍️ Spend', val: spendDisplay, col: '#fb923c' },
          { label: '🏦 Save', val: saveDisplay, col: '#60a5fa' },
          { label: '🤝 Give', val: giveDisplay, col: '#4ade80' },
        ].map(({ label, val, col }) => (
          <div key={label} className="text-center">
            <div className="font-bold" style={{ color: col }}>
              {val}
            </div>
            <div className="text-white/40 text-xs">{label}</div>
          </div>
        ))}
      </div>

      {/* Admin gear */}
      <button
        onClick={() => router.push('/admin')}
        className="text-2xl text-white/30 hover:text-white/70 transition-colors ml-2"
      >
        ⚙
      </button>
    </div>
  )
}
