'use client'

interface Props {
  id: number
  name: string
  imagePath: string | null
  imageStatus: 'pending' | 'ready' | 'failed'
  completed: boolean
  accentColour: string
  onToggle: (id: number) => void
}

export default function ChoreCard({
  id,
  name,
  imagePath,
  imageStatus,
  completed,
  accentColour,
  onToggle,
}: Props) {
  return (
    <button
      onClick={() => onToggle(id)}
      className="relative rounded-2xl overflow-hidden transition-all duration-200 active:scale-95 w-full h-full"
      style={{
        background: 'rgba(255,255,255,0.07)',
        border: `2px solid ${completed ? accentColour : 'rgba(255,255,255,0.1)'}`,
        opacity: completed ? 0.65 : 1,
        display: 'grid',
        gridTemplateRows: '1fr auto',
        contain: 'strict',
      }}
    >
      {/* Image area */}
      <div className="w-full h-full overflow-hidden flex items-center justify-center bg-black/20">
        {imageStatus === 'ready' && imagePath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagePath} alt={name} className="w-full h-full object-cover" />
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
      <div className="px-1 py-1 text-center text-xs font-bold text-white/90 bg-black/40 leading-tight">
        {name}
      </div>

      {/* Completed overlay */}
      {completed && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: `${accentColour}33` }}
        >
          <span className="text-5xl drop-shadow-lg">✅</span>
        </div>
      )}
    </button>
  )
}
