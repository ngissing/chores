'use client'
import { centsToDisplay } from '@/lib/points'

interface Props {
  bucket: 'spend' | 'save' | 'give'
  allocatedCents: number
  balanceCents: number
  canAdd: boolean
  onAdd: () => void
  onRemove: () => void
}

const CONFIG = {
  spend: { icon: '🛍️', label: 'Spend', colour: '#fb923c' },
  save: { icon: '🏦', label: 'Save', colour: '#60a5fa' },
  give: { icon: '🤝', label: 'Give', colour: '#4ade80' },
}

export default function BucketColumn({
  bucket,
  allocatedCents,
  balanceCents,
  canAdd,
  onAdd,
  onRemove,
}: Props) {
  const { icon, label, colour } = CONFIG[bucket]

  return (
    <div
      className="flex-1 flex flex-col items-center justify-center gap-4 py-4"
      style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="text-5xl">{icon}</div>
      <div
        className="text-xl font-bold text-white"
        style={{ fontFamily: 'var(--font-fredoka)' }}
      >
        {label}
      </div>

      <div
        className="text-4xl font-bold"
        style={{ fontFamily: 'var(--font-fredoka)', color: colour }}
      >
        {centsToDisplay(allocatedCents)}
      </div>

      {/* +/- controls — 44×44px minimum touch target */}
      <div className="flex gap-4 items-center">
        <button
          onClick={onRemove}
          disabled={allocatedCents === 0}
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl font-black text-white transition-all active:scale-95"
          style={{
            background: 'rgba(255,255,255,0.1)',
            opacity: allocatedCents === 0 ? 0.3 : 1,
          }}
        >
          −
        </button>
        <button
          onClick={onAdd}
          disabled={!canAdd}
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl font-black active:scale-95 transition-transform"
          style={{
            background: colour,
            color: bucket === 'give' ? '#111' : '#fff',
            opacity: canAdd ? 1 : 0.4,
          }}
        >
          +
        </button>
      </div>

      <div className="text-xs text-white/40 font-bold text-center">
        Balance:{' '}
        <span className="text-white/70">{centsToDisplay(balanceCents)}</span>
      </div>
    </div>
  )
}
