'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDuration, isPersonalBest } from '@/lib/stopwatch'

interface Run { duration_ms: number; created_at?: string }

export default function StopwatchOverlay({
  memberId,
  colour,
  onClose,
}: {
  memberId: number
  colour: string
  onClose: () => void
}) {
  const [phase, setPhase] = useState<'idle' | 'running' | 'stopped'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [runs, setRuns] = useState<Run[]>([])
  const [bestMsState, setBestMsState] = useState<number | null>(null)
  const [newBest, setNewBest] = useState(false)
  const startedAt = useRef(0)
  const raf = useRef<number | null>(null)

  const loadRuns = useCallback(async () => {
    const res = await fetch(`/api/stopwatch?member_id=${memberId}`)
    if (res.ok) {
      const data = await res.json()
      setRuns(data.runs ?? [])
      setBestMsState(data.best_ms ?? null)
    }
  }, [memberId])

  useEffect(() => { loadRuns() }, [loadRuns])

  const tick = useCallback(() => {
    setElapsed(Date.now() - startedAt.current)
    raf.current = requestAnimationFrame(tick)
  }, [])

  const start = () => {
    setNewBest(false)
    startedAt.current = Date.now()
    setElapsed(0)
    setPhase('running')
    raf.current = requestAnimationFrame(tick)
  }

  const stop = async () => {
    if (raf.current) cancelAnimationFrame(raf.current)
    const final = Date.now() - startedAt.current
    setElapsed(final)
    setPhase('stopped')
    const wasBest = isPersonalBest(final, runs)
    await fetch('/api/stopwatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: memberId, duration_ms: final }),
    })
    if (wasBest) {
      setNewBest(true)
      const { default: confetti } = await import('canvas-confetti')
      confetti({ particleCount: 160, spread: 80, origin: { y: 0.6 } })
    }
    loadRuns()
  }

  const reset = () => {
    setElapsed(0)
    setNewBest(false)
    setPhase('idle')
  }

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current) }, [])

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-8"
      style={{ background: '#0b0b14' }}>
      <button onClick={onClose}
        className="absolute top-5 right-6 text-white/40 text-4xl leading-none" aria-label="Close">✕</button>

      <div className="font-bold tabular-nums" style={{
        fontFamily: 'var(--font-fredoka)',
        fontSize: 'min(28vw, 12rem)',
        color: phase === 'stopped' ? colour : '#ffffff',
        lineHeight: 1,
      }}>
        {formatDuration(elapsed)}
      </div>

      {newBest && (
        <div className="text-3xl font-black" style={{ color: colour }}>New best! 🎉</div>
      )}

      {phase !== 'stopped' ? (
        <button onClick={phase === 'idle' ? start : stop}
          className="px-16 py-6 rounded-3xl text-white font-black active:scale-95 transition-transform"
          style={{ background: phase === 'running' ? '#ef4444' : colour, fontFamily: 'var(--font-fredoka)', fontSize: '2.5rem' }}>
          {phase === 'idle' ? 'Start' : 'Stop'}
        </button>
      ) : (
        <button onClick={reset}
          className="px-16 py-6 rounded-3xl text-white font-black active:scale-95 transition-transform"
          style={{ background: colour, fontFamily: 'var(--font-fredoka)', fontSize: '2.5rem' }}>
          Go again
        </button>
      )}

      <div className="flex flex-col items-center gap-1 text-white/60">
        <div className="text-xl font-bold">
          Best: <span style={{ color: colour }}>{bestMsState !== null ? formatDuration(bestMsState) : '—'}</span>
        </div>
        {runs.length > 0 && (
          <div className="flex gap-3 text-sm">
            {runs.map((r, i) => <span key={i} className="tabular-nums">{formatDuration(r.duration_ms)}</span>)}
          </div>
        )}
      </div>
    </div>
  )
}
