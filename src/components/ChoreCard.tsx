'use client'

interface Props {
  id: number
  name: string
  imagePath: string | null
  imageStatus: 'pending' | 'ready' | 'failed'
  completed: boolean
  accentColour: string
  isPending?: boolean
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
        contain: 'strict',
        containerType: 'inline-size',
        boxShadow: completed ? `0 0 16px ${accentColour}66` : undefined,
      }}
    >
      {/* Image area */}
      <div className="w-full overflow-hidden flex items-center justify-center bg-white" style={{ minHeight: 0 }}>
        {imageStatus === 'ready' && imagePath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagePath} alt={name} className="w-full h-full object-contain" style={{ opacity: completed ? 0.45 : 1 }} />
        ) : (
          <span
            className="text-4xl"
            style={{ animation: imageStatus === 'pending' ? 'pulse 2s infinite' : undefined }}
          >
            {imageStatus === 'failed' ? '⚠️' : '⏳'}
          </span>
        )}
      </div>

      {/* Label */}
      <div
        className="px-2 py-2 text-center font-extrabold leading-tight"
        style={{
          fontSize: 'clamp(0.75rem, 1.8cqw, 1.1rem)',
          background: completed ? accentColour : 'rgba(0,0,0,0.55)',
          color: completed ? '#fff' : 'rgba(255,255,255,0.95)',
          letterSpacing: '0.01em',
        }}
      >
        {name}
      </div>

      {/* Completed overlay — big centred tick */}
      {completed && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ paddingBottom: '2.5rem' }}>
          <span
            className="drop-shadow-lg"
            style={{ fontSize: 'clamp(2.5rem, 8cqw, 5rem)', lineHeight: 1 }}
          >
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
