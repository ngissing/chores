'use client'
import { useState } from 'react'
import GoldApprovalOverlay from './GoldApprovalOverlay'
import type { Member } from '@/hooks/useMembers'

interface Props {
  id: number
  name: string
  imagePath: string | null
  imageStatus: 'pending' | 'ready' | 'failed'
  points: number
  members: Member[]
  activeMemberId: number | null
  onAwarded: () => void
}

export default function GoldChoreCard({
  id,
  name,
  imagePath,
  imageStatus,
  points,
  members,
  activeMemberId,
  onAwarded,
}: Props) {
  const [showOverlay, setShowOverlay] = useState(false)

  const handleSuccess = async () => {
    setShowOverlay(false)
    try {
      const { default: confetti } = await import('canvas-confetti')
      confetti({ particleCount: 200, spread: 90, origin: { y: 0.6 } })
    } catch {
      // confetti is non-critical; continue
    }
    onAwarded()
  }

  return (
    <>
      <button
        type="button"
        aria-label={`Award gold chore: ${name}`}
        onClick={() => setShowOverlay(true)}
        className="relative rounded-2xl overflow-hidden transition-all duration-200 active:scale-95 w-full h-full"
        style={{
          border: '3px solid #f59e0b',
          background: 'linear-gradient(160deg, rgba(245,158,11,0.15), rgba(0,0,0,0.3))',
          display: 'grid',
          gridTemplateRows: '1fr auto',
          boxShadow: '0 0 16px rgba(245,158,11,0.3)',
        }}
      >
        {/* Image area */}
        <div
          className="w-full overflow-hidden flex items-center justify-center bg-white"
          style={{ minHeight: 0 }}
        >
          {imageStatus === 'ready' && imagePath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagePath} alt={name} className="w-full h-full object-contain" />
          ) : (
            <span className={`text-4xl${imageStatus === 'pending' ? ' animate-pulse' : ''}`}>
              {imageStatus === 'failed' ? '⚠️' : '⏳'}
            </span>
          )}
        </div>

        {/* Gold label */}
        <div
          aria-hidden="true"
          className="text-center font-extrabold leading-snug"
          style={{
            fontSize: 'clamp(1rem, 2.2vw, 2rem)',
            padding: 'clamp(0.5rem, 1.2vw, 1.25rem) clamp(0.4rem, 1vw, 1rem)',
            background: 'linear-gradient(90deg, #92400e, #b45309)',
            color: '#fef3c7',
            letterSpacing: '0.01em',
          }}
        >
          ⭐ {name} · {points}pt
        </div>
      </button>

      {showOverlay && (
        <GoldApprovalOverlay
          choreId={id}
          choreName={name}
          chorePoints={points}
          members={members}
          initialMemberId={activeMemberId}
          onSuccess={handleSuccess}
          onClose={() => setShowOverlay(false)}
        />
      )}
    </>
  )
}
