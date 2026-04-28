'use client'
import Image from 'next/image'
import type { Member } from '@/hooks/useMembers'

interface Props {
  members: Member[]
  activeMemberId: number | null
  onSelect: (id: number) => void
}

export default function MemberSelector({ members, activeMemberId, onSelect }: Props) {
  return (
    <div className="flex gap-3 px-4 py-2 flex-shrink-0">
      {members.map((m) => {
        const active = m.id === activeMemberId
        return (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-2xl border-2 transition-all duration-200 flex-1"
            style={{
              borderColor: active ? m.colour : 'transparent',
              background: active ? `${m.colour}22` : 'rgba(255,255,255,0.05)',
              opacity: active ? 1 : 0.5,
            }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0 overflow-hidden"
              style={{ background: m.colour }}
            >
              {m.photo_path ? (
                <Image
                  src={m.photo_path}
                  alt={m.name}
                  width={40}
                  height={40}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-white text-lg">{m.name[0]}</span>
              )}
            </div>
            <div className="text-left min-w-0">
              <div
                className="font-bold text-sm leading-tight truncate"
                style={{
                  fontFamily: 'var(--font-fredoka)',
                  color: active ? m.colour : 'white',
                }}
              >
                {m.name}
              </div>
              <div className="text-xs text-white/50">age {m.age}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
