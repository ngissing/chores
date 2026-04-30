'use client'
import { computeGridLayout } from '@/lib/grid'
import ChoreCard from './ChoreCard'
import type { Chore } from '@/hooks/useChores'

interface Props {
  chores: Chore[]
  completedIds: Set<number>
  accentColour: string
  pendingIds?: Set<number>
  onToggle: (choreId: number) => void
}

export default function ChoreGrid({ chores, completedIds, accentColour, pendingIds, onToggle }: Props) {
  const { cols, rows } = computeGridLayout(chores.length)

  if (chores.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/30 text-lg">
        No chores for this routine 🎉
      </div>
    )
  }

  return (
    <div
      className="flex-1 min-h-0 p-3"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: '0.6rem',
      }}
    >
      {chores.map((chore) => (
        <ChoreCard
          key={chore.id}
          id={chore.id}
          name={chore.name}
          imagePath={chore.image_path}
          imageStatus={chore.image_status}
          completed={completedIds.has(chore.id)}
          accentColour={accentColour}
          isPending={pendingIds?.has(chore.id)}
          onToggle={onToggle}
        />
      ))}
    </div>
  )
}
