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
      className="flex items-center gap-4 px-5 flex-shrink-0"
      style={{
        background: 'rgba(0,0,0,0.45)',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        minHeight: '5rem',
      }}
    >
      {/* Unallocated points — tap to cash in */}
      <button
        onClick={() => memberId && unallocatedCents > 0 && router.push(`/cashin/${memberId}`)}
        disabled={unallocatedCents === 0}
        className="flex flex-col items-start transition-opacity active:scale-95"
        style={{
          opacity: unallocatedCents > 0 ? 1 : 0.4,
          minWidth: '5rem',
          padding: '0.5rem 0.75rem 0.5rem 0',
        }}
      >
        <span
          className="font-bold leading-tight"
          style={{ fontFamily: 'var(--font-fredoka)', color: accentColour, fontSize: '2rem' }}
        >
          {unallocatedDisplay}
        </span>
        <span className="text-white/50" style={{ fontSize: '0.8rem' }}>
          {unallocatedCents > 0 ? 'tap to cash in ›' : 'unallocated'}
        </span>
      </button>

      {/* Streak badge */}
      {streakDays > 1 && (
        <div className="flex items-center gap-1 font-bold text-orange-400" style={{ fontSize: '1rem' }}>
          🔥 {streakDays}
        </div>
      )}

      <div className="flex-1" />

      {/* Bucket balances */}
      <div className="flex gap-5">
        {[
          { label: '🛍️ Spend', val: spendDisplay, col: '#fb923c' },
          { label: '🏦 Save', val: saveDisplay, col: '#60a5fa' },
          { label: '🤝 Give', val: giveDisplay, col: '#4ade80' },
        ].map(({ label, val, col }) => (
          <div key={label} className="flex flex-col items-center gap-0.5">
            <div className="font-bold" style={{ color: col, fontSize: '1.2rem' }}>
              {val}
            </div>
            <div className="text-white/40" style={{ fontSize: '0.75rem' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Admin gear */}
      <button
        onClick={() => router.push('/admin')}
        className="text-white/30 hover:text-white/70 transition-colors"
        style={{ fontSize: '1.75rem', padding: '0.5rem', marginLeft: '0.25rem' }}
      >
        ⚙
      </button>
    </div>
  )
}
