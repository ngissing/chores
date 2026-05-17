'use client'
import { centsToDisplay } from '@/lib/points'

interface Props {
  totalCents: number
  remainingCents: number
  canAllocateMore: boolean
  isConfirming?: boolean
  onConfirm: () => void
}

export default function AllocationFooter({ totalCents, remainingCents, canAllocateMore, isConfirming, onConfirm }: Props) {
  // Done when fully allocated OR when remaining is too small to split further
  const allDone = remainingCents === 0 || !canAllocateMore

  const statusLabel = remainingCents === 0
    ? `All ${centsToDisplay(totalCents)} allocated ✓`
    : canAllocateMore
      ? `${centsToDisplay(remainingCents)} still to allocate ⚠️`
      : `${centsToDisplay(remainingCents)} remainder — too small to split, stays unallocated`

  const statusStyle = remainingCents === 0
    ? { background: 'rgba(74,222,128,0.1)', color: '#4ade80' }
    : canAllocateMore
      ? { background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }
      : { background: 'rgba(99,102,241,0.12)', color: '#a5b4fc' }

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
        style={statusStyle}
      >
        {statusLabel}
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
