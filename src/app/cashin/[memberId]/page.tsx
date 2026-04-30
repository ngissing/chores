'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useMembers } from '@/hooks/useMembers'
import { usePoints } from '@/hooks/usePoints'
import BucketColumn from '@/components/cashin/BucketColumn'
import AllocationFooter from '@/components/cashin/AllocationFooter'
import { centsToDisplay } from '@/lib/points'

const INCREMENT = 50 // $0.50 per tap

export default function CashInPage() {
  const { memberId } = useParams<{ memberId: string }>()
  const router = useRouter()
  const mid = Number(memberId)
  const { members } = useMembers()
  const points = usePoints(isNaN(mid) ? null : mid)
  const [allocations, setAllocations] = useState({ spend: 0, save: 0, give: 0 })
  const [isConfirming, setIsConfirming] = useState(false)

  const member = members.find((m) => m.id === mid)
  const accentColour = member?.colour ?? '#6366f1'
  const totalCents = points.unallocated
  const allocated = allocations.spend + allocations.save + allocations.give
  const remaining = totalCents - allocated

  // Redirect if invalid memberId
  useEffect(() => {
    if (isNaN(mid)) {
      router.replace('/')
    }
  }, [mid, router])

  // Redirect back if nothing to allocate (only after SWR has loaded)
  useEffect(() => {
    if (!points.isLoading && totalCents === 0) {
      router.replace('/')
    }
  }, [points.isLoading, totalCents, router])

  const add = (b: 'spend' | 'save' | 'give') => {
    if (remaining < INCREMENT) return
    setAllocations((a) => ({ ...a, [b]: a[b] + INCREMENT }))
  }

  const remove = (b: 'spend' | 'save' | 'give') =>
    setAllocations((a) => ({ ...a, [b]: Math.max(0, a[b] - INCREMENT) }))

  const handleConfirm = async () => {
    if (isConfirming) return
    setIsConfirming(true)
    try {
      const res = await fetch('/api/points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'allocate', member_id: mid, allocations }),
      })
      if (!res.ok) {
        setIsConfirming(false)
        return
      }
      const { default: confetti } = await import('canvas-confetti')
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } })
      setTimeout(() => router.push('/'), 2000)
    } catch {
      setIsConfirming(false)
    }
  }

  if (isNaN(mid)) return null

  return (
    <div
      className="w-screen h-screen flex flex-col overflow-hidden"
      style={{ background: `${accentColour}18`, position: 'relative' }}
    >
      {/* Radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 80% 40% at 50% 0%, ${accentColour}25, transparent 70%)`,
          zIndex: 0,
        }}
      />

      {/* Top bar */}
      <div
        className="relative z-10 flex items-center px-4 py-3 flex-shrink-0"
        style={{
          background: 'rgba(0,0,0,0.35)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <button
          onClick={() => router.push('/')}
          className="px-3 py-3 rounded-xl text-sm font-bold text-white/50"
          style={{ background: 'rgba(255,255,255,0.09)' }}
        >
          ← Back
        </button>
        <span
          className="ml-3 text-lg text-white"
          style={{ fontFamily: 'var(--font-fredoka)' }}
        >
          {member?.name ?? ''} Cash-In
        </span>
        <div className="ml-auto text-right">
          <div
            className="text-xl font-bold"
            style={{
              fontFamily: 'var(--font-fredoka)',
              color: remaining === 0 ? '#4ade80' : accentColour,
            }}
          >
            {centsToDisplay(totalCents)}
          </div>
          <div className="text-xs text-white/35">
            {remaining === 0 ? 'all allocated' : 'to allocate'}
          </div>
        </div>
      </div>

      {/* Bucket columns */}
      <div className="relative z-10 flex flex-1 min-h-0">
        {(['spend', 'save', 'give'] as const).map((b) => (
          <BucketColumn
            key={b}
            bucket={b}
            allocatedCents={allocations[b]}
            balanceCents={points[b]}
            canAdd={remaining >= INCREMENT}
            onAdd={() => add(b)}
            onRemove={() => remove(b)}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="relative z-10">
        <AllocationFooter
          totalCents={totalCents}
          remainingCents={remaining}
          isConfirming={isConfirming}
          onConfirm={handleConfirm}
        />
      </div>
    </div>
  )
}
