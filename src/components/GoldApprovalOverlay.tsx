'use client'
import { useState, useRef, useEffect } from 'react'
import type { Member } from '@/hooks/useMembers'

interface Props {
  choreId: number
  choreName: string
  chorePoints: number
  members: Member[]
  initialMemberId: number | null
  onSuccess: (earnedCents: number) => void
  onClose: () => void
}

export default function GoldApprovalOverlay({
  choreId,
  choreName,
  chorePoints,
  members,
  initialMemberId,
  onSuccess,
  onClose,
}: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(
    initialMemberId ?? members[0]?.id ?? null
  )
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)
  const [locked, setLocked] = useState(false)
  const [lockSeconds, setLockSeconds] = useState(0)
  const [, setAttempts] = useState(0)
  const [noPinSet, setNoPinSet] = useState(false)
  const lockRef = useRef<NodeJS.Timeout | null>(null)
  const submitting = useRef(false)

  useEffect(() => {
    return () => { if (lockRef.current) clearInterval(lockRef.current) }
  }, [])

  const press = (digit: string) => {
    if (locked || !selectedId || pin.length >= 4) return
    const next = pin + digit
    setPin(next)
    if (next.length === 4) award(next)
  }

  const award = async (p: string) => {
    if (!selectedId || submitting.current) return
    submitting.current = true
    try {
      let data: { ok?: boolean; earned_cents?: number; error?: string }
      try {
        const res = await fetch(`/api/gold-chores/${choreId}/award`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ member_id: selectedId, pin: p }),
        })
        data = await res.json() as { ok?: boolean; earned_cents?: number; error?: string }
      } catch {
        setShake(true)
        setPin('')
        setTimeout(() => setShake(false), 500)
        return
      }
      if (data.ok) {
        onSuccess(data.earned_cents ?? 0)
      } else {
        if (data.error === 'NO_PIN_SET') {
          setNoPinSet(true)
          setPin('')
          return
        }
        setShake(true)
        setPin('')
        setTimeout(() => setShake(false), 500)
        setAttempts((prev) => {
          const next = prev + 1
          if (next >= 3) {
            setLocked(true)
            let secs = 30
            setLockSeconds(secs)
            if (lockRef.current) clearInterval(lockRef.current)
            const tick = setInterval(() => {
              secs -= 1
              setLockSeconds(secs)
              if (secs <= 0) {
                clearInterval(tick)
                setLocked(false)
                setAttempts(0)
              }
            }, 1000)
            lockRef.current = tick
          }
          return next
        })
      }
    } finally {
      submitting.current = false
    }
  }

  const digits = ['1','2','3','4','5','6','7','8','9','','0','⌫']
  const selectedMember = members.find((m) => m.id === selectedId)

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/80 z-50"
      onClick={onClose}
    >
      <div
        className="flex flex-col items-center gap-5 p-8 rounded-3xl"
        style={{
          background: 'rgba(20,15,5,0.95)',
          border: '2px solid #f59e0b',
          boxShadow: '0 0 40px rgba(245,158,11,0.3)',
          animation: shake ? 'shake 0.4s' : undefined,
          maxWidth: '340px',
          width: '90vw',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="text-center">
          <div
            className="text-2xl font-bold text-amber-400"
            style={{ fontFamily: 'var(--font-fredoka)' }}
          >
            ⭐ {choreName}
          </div>
          <div className="text-white/50 text-sm mt-1">
            Awarding to {selectedMember?.name ?? '…'} · {chorePoints} pts
          </div>
        </div>

        {/* Member selector */}
        <div className="flex gap-2 flex-wrap justify-center">
          {members.map((m) => (
            <button
              key={m.id}
              onClick={() => { setSelectedId(m.id); setNoPinSet(false); setPin('') }}
              className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
              style={{
                background: selectedId === m.id ? m.colour : 'rgba(255,255,255,0.08)',
                color: selectedId === m.id ? 'white' : 'rgba(255,255,255,0.5)',
                border: `2px solid ${selectedId === m.id ? m.colour : 'transparent'}`,
              }}
            >
              {m.name}
            </button>
          ))}
        </div>

        {selectedMember && (
          <div className="text-xs text-white/40">
            Enter parent PIN to award to {selectedMember.name}
          </div>
        )}

        {noPinSet ? (
          <div className="text-amber-300 text-sm text-center px-4">
            Ask a parent to set up a PIN in Settings first.
          </div>
        ) : (
          <>
            {/* PIN dots */}
            <div className="flex gap-3">
              {[0,1,2,3].map((i) => (
                <div
                  key={i}
                  className="w-5 h-5 rounded-full border-2"
                  style={{
                    borderColor: 'rgba(245,158,11,0.4)',
                    background: pin.length > i ? '#f59e0b' : 'transparent',
                  }}
                />
              ))}
            </div>

            {locked && (
              <div className="text-red-400 text-sm">Locked — try again in {lockSeconds}s</div>
            )}

            {/* Numpad */}
            <div className="grid grid-cols-3 gap-3">
              {digits.map((d, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (locked) return
                    if (d === '⌫') setPin((p) => p.slice(0, -1))
                    else if (d) press(d)
                  }}
                  disabled={locked || d === ''}
                  className="w-16 h-16 rounded-2xl text-xl font-bold text-white transition-all active:scale-95"
                  style={{ background: d ? 'rgba(255,255,255,0.1)' : 'transparent' }}
                >
                  {d}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-8px)}
          40%{transform:translateX(8px)}
          60%{transform:translateX(-6px)}
          80%{transform:translateX(6px)}
        }
      `}</style>
    </div>
  )
}
