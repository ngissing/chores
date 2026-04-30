'use client'
import { useState, useRef, useEffect } from 'react'

interface Props {
  onSuccess: () => void
}

export default function PinGate({ onSuccess }: Props) {
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [locked, setLocked] = useState(false)
  const [lockSeconds, setLockSeconds] = useState(0)
  const lockRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => {
      if (lockRef.current) clearInterval(lockRef.current)
    }
  }, [])

  const press = (digit: string) => {
    if (locked) return
    const next = pin + digit
    setPin(next)
    if (next.length === 4) verify(next)
  }

  const verify = async (p: string) => {
    const res = await fetch('/api/settings/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: p }),
    })
    const { ok } = await res.json()
    if (ok) {
      onSuccess()
    } else {
      setAttempts((prev) => prev + 1)
      const newAttempts = attempts + 1
      setShake(true)
      setPin('')
      setTimeout(() => setShake(false), 500)
      if (newAttempts >= 3) {
        setLocked(true)
        let secs = 30
        setLockSeconds(secs)
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
    }
  }

  const digits = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/80 z-50">
      <div
        className="flex flex-col items-center gap-6 p-8 rounded-3xl"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
          animation: shake ? 'shake 0.4s' : undefined }}
      >
        <div className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-fredoka)' }}>
          Admin PIN
        </div>

        <div className="flex gap-3">
          {[0,1,2,3].map((i) => (
            <div key={i} className="w-5 h-5 rounded-full border-2 border-white/40"
              style={{ background: pin.length > i ? 'white' : 'transparent' }} />
          ))}
        </div>

        {locked && (
          <div className="text-red-400 text-sm">Locked — try again in {lockSeconds}s</div>
        )}

        <div className="grid grid-cols-3 gap-3">
          {digits.map((d, i) => (
            <button key={i}
              onClick={() => {
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
