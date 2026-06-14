'use client'
import { NOTE_COLORS } from '@/lib/chores'

interface Props {
  id: number
  name: string
  imagePath: string | null
  imageStatus: 'pending' | 'ready' | 'failed'
  completed: boolean
  accentColour: string
  isPending?: boolean
  noteText?: string
  noteColor?: string
  noteVisible?: boolean
  onToggle: (id: number) => void
}

export default function ChoreCard({
  id,
  name,
  imagePath,
  imageStatus,
  completed,
  accentColour,
  isPending,
  noteText,
  noteColor,
  noteVisible,
  onToggle,
}: Props) {
  return (
    <button
      onClick={() => onToggle(id)}
      className="relative rounded-2xl overflow-hidden transition-all duration-200 active:scale-95 w-full h-full"
      style={{
        background: 'rgba(255,255,255,0.07)',
        border: `3px solid ${completed ? accentColour : 'rgba(255,255,255,0.1)'}`,
        display: 'grid',
        gridTemplateRows: '1fr auto',
        boxShadow: completed ? `0 0 20px ${accentColour}88` : undefined,
      }}
    >
      {/* Image area */}
      <div className="w-full overflow-hidden flex items-center justify-center bg-white relative" style={{ minHeight: 0 }}>
        {imageStatus === 'ready' && imagePath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagePath} alt={name} className="w-full h-full object-contain" style={{ opacity: completed ? 0.35 : 1 }} />
        ) : (
          <span
            className="text-4xl"
            style={{ animation: imageStatus === 'pending' ? 'pulse 2s infinite' : undefined }}
          >
            {imageStatus === 'failed' ? '⚠️' : '⏳'}
          </span>
        )}

        {/* Scheduled note banner */}
        {noteVisible && noteText && (
          <div
            className="absolute bottom-0 left-0 right-0 text-center font-bold"
            style={{
              background: NOTE_COLORS[noteColor ?? 'yellow'] ?? NOTE_COLORS.yellow,
              color: '#1a1a2e',
              padding: '0.3rem 0.5rem',
              fontSize: 'clamp(0.75rem, 1.6vw, 1.25rem)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {noteText}
          </div>
        )}
      </div>

      {/* Label */}
      <div
        className="text-center font-extrabold leading-snug"
        style={{
          fontSize: 'clamp(1rem, 2.2vw, 2rem)',
          padding: 'clamp(0.5rem, 1.2vw, 1.25rem) clamp(0.4rem, 1vw, 1rem)',
          background: completed ? accentColour : 'rgba(0,0,0,0.6)',
          color: '#fff',
          letterSpacing: '0.01em',
        }}
      >
        {name}
      </div>

      {/* Completed overlay — big centred tick */}
      {completed && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ paddingBottom: '15%' }}>
          <span style={{ fontSize: 'min(30vw, 30vh, 8rem)', lineHeight: 1, filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.4))' }}>
            ✅
          </span>
        </div>
      )}

      {/* Pending overlay */}
      {isPending && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
        >
          <span className="text-5xl drop-shadow-lg">⏳</span>
        </div>
      )}
    </button>
  )
}
