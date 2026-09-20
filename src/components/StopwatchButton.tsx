'use client'
import { useEffect, useState } from 'react'
import { readRunStart, clearRunStart, hasExpired } from '@/lib/stopwatchRun'

function fmtClock(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Top-bar stopwatch launcher. When a run is in progress it shows the live time
// (so a backgrounded run can't be forgotten) and enforces the 2-hour auto-stop
// even while the overlay is closed.
export default function StopwatchButton({ memberId, onOpen }: { memberId: number; onOpen: () => void }) {
  const [runningMs, setRunningMs] = useState<number | null>(null)

  useEffect(() => {
    const check = () => {
      const s = readRunStart(memberId)
      if (s === null) {
        setRunningMs(null)
        return
      }
      if (hasExpired(s, Date.now())) {
        clearRunStart(memberId)
        setRunningMs(null)
        return
      }
      setRunningMs(Date.now() - s)
    }
    check()
    const t = setInterval(check, 1000)
    return () => clearInterval(t)
  }, [memberId])

  if (runningMs !== null) {
    return (
      <button onClick={onOpen}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 font-bold text-white animate-pulse"
        style={{ background: '#ef4444', fontFamily: 'var(--font-fredoka)' }}
        aria-label="Stopwatch running">
        <span>⏱</span>
        <span className="tabular-nums text-sm">{fmtClock(runningMs)}</span>
      </button>
    )
  }

  return (
    <button onClick={onOpen}
      className="text-white/40 hover:text-white/80 transition-colors"
      style={{ fontSize: '1.5rem', padding: '0.4rem' }} aria-label="Stopwatch">
      ⏱
    </button>
  )
}
