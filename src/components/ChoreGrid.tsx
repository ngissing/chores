'use client'
import { computeGridLayout } from '@/lib/grid'
import ChoreCard from './ChoreCard'
import GoldChoreCard from './GoldChoreCard'
import type { Chore } from '@/hooks/useChores'
import type { GoldChore } from '@/hooks/useGoldChores'
import type { Member } from '@/hooks/useMembers'

interface Props {
  chores: Chore[]
  completedIds: Set<number>
  accentColour: string
  pendingIds?: Set<number>
  onToggle: (choreId: number) => void
  goldChores?: GoldChore[]
  members?: Member[]
  activeMemberId?: number | null
  onGoldAwarded?: () => void
}

export default function ChoreGrid({
  chores,
  completedIds,
  accentColour,
  pendingIds,
  onToggle,
  goldChores = [],
  members = [],
  activeMemberId = null,
  onGoldAwarded,
}: Props) {
  const total = chores.length + goldChores.length
  const { cols, rows } = computeGridLayout(total)

  if (total === 0) {
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
      {goldChores.map((gc) => (
        <GoldChoreCard
          key={`gold-${gc.id}`}
          id={gc.id}
          name={gc.name}
          imagePath={gc.image_path}
          imageStatus={gc.image_status}
          points={gc.points}
          members={members}
          activeMemberId={activeMemberId}
          onAwarded={onGoldAwarded ?? (() => {})}
        />
      ))}
    </div>
  )
}
