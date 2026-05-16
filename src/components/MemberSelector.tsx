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
    <div
      className="flex gap-3 px-4 flex-shrink-0"
      style={{
        background: 'rgba(0,0,0,0.45)',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        minHeight: '6rem',
        alignItems: 'center',
      }}
    >
      {members.map((m) => {
        const active = m.id === activeMemberId
        return (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className="flex items-center gap-3 rounded-2xl border-2 transition-all duration-200 active:scale-95 flex-1"
            style={{
              borderColor: active ? m.colour : 'rgba(255,255,255,0.08)',
              background: active ? `${m.colour}28` : 'rgba(255,255,255,0.05)',
              opacity: active ? 1 : 0.55,
              padding: '0.6rem 1rem',
              boxShadow: active ? `0 0 12px ${m.colour}44` : undefined,
            }}
          >
            <div
              className="rounded-full flex items-center justify-center font-bold flex-shrink-0 overflow-hidden"
              style={{ background: m.colour, width: '3.2rem', height: '3.2rem' }}
            >
              {m.photo_path ? (
                <Image
                  src={m.photo_path}
                  alt={m.name}
                  width={52}
                  height={52}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-white" style={{ fontSize: '1.4rem' }}>{m.name[0]}</span>
              )}
            </div>
            <div className="text-left min-w-0">
              <div
                className="font-bold leading-tight truncate"
                style={{
                  fontFamily: 'var(--font-fredoka)',
                  color: active ? m.colour : 'white',
                  fontSize: '1.15rem',
                }}
              >
                {m.name}
              </div>
              <div className="text-white/50" style={{ fontSize: '0.75rem' }}>age {m.age}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
