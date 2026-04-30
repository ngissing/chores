'use client'
import { centsToDisplay } from '@/lib/points'

interface Props {
  totalCents: number
  remainingCents: number
  isConfirming?: boolean
  onConfirm: () => void
}

export default function AllocationFooter({ totalCents, remainingCents, isConfirming, onConfirm }: Props) {
  const allDone = remainingCents === 0

  return (
    <div
      className="flex items-center gap-4 px-4 py-3 flex-shrink-0"
      style={{
        background: 'rgba(0,0,0,0.4)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <div
        className="px-4 py-2 rounded-xl text-sm font-bold"
        style={{
          background: allDone ? 'rgba(74,222,128,0.1)' : 'rgba(245,158,11,0.12)',
          color: allDone ? '#4ade80' : '#f59e0b',
        }}
      >
        {allDone
          ? `All ${centsToDisplay(totalCents)} allocated ✓`
          : `${centsToDisplay(remainingCents)} still to allocate ⚠️`}
      </div>
      <div className="flex-1" />
      <button
        onClick={onConfirm}
        disabled={!allDone || isConfirming}
        className="px-6 py-3 rounded-2xl text-base font-black transition-all active:scale-95"
        style={{
          background: allDone && !isConfirming ? '#4ade80' : 'rgba(255,255,255,0.1)',
          color: allDone && !isConfirming ? '#111' : 'rgba(255,255,255,0.3)',
        }}
      >
        {isConfirming ? '...' : 'Confirm →'}
      </button>
    </div>
  )
}
