'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDuration, isPersonalBest } from '@/lib/stopwatch'
import { AUTO_STOP_MS, readRunStart, writeRunStart, clearRunStart } from '@/lib/stopwatchRun'

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
  const [autoStopped, setAutoStopped] = useState(false)
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

  const stopTicking = () => {
    if (raf.current) cancelAnimationFrame(raf.current)
    raf.current = null
  }

  // Auto-stop a forgotten run: discard it (no saved time) once past the cap.
  const autoStop = useCallback(() => {
    stopTicking()
    clearRunStart(memberId)
    startedAt.current = 0
    setElapsed(0)
    setPhase('idle')
    setAutoStopped(true)
  }, [memberId])

  const tick = useCallback(() => {
    const e = Date.now() - startedAt.current
    if (e >= AUTO_STOP_MS) {
      autoStop()
      return
    }
    setElapsed(e)
    raf.current = requestAnimationFrame(tick)
  }, [autoStop])

  // On open: resume an in-progress run from the persisted start (or auto-stop if
  // it's already older than the cap).
  useEffect(() => {
    loadRuns()
    const s = readRunStart(memberId)
    if (s !== null) {
      if (Date.now() - s >= AUTO_STOP_MS) {
        clearRunStart(memberId)
        setAutoStopped(true)
      } else {
        startedAt.current = s
        setElapsed(Date.now() - s)
        setPhase('running')
        raf.current = requestAnimationFrame(tick)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId])

  useEffect(() => () => stopTicking(), [])

  const start = () => {
    setNewBest(false)
    setAutoStopped(false)
    startedAt.current = Date.now()
    writeRunStart(memberId, startedAt.current)
    setElapsed(0)
    setPhase('running')
    raf.current = requestAnimationFrame(tick)
  }

  const stop = async () => {
    stopTicking()
    const final = Date.now() - startedAt.current
    clearRunStart(memberId)
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
    setAutoStopped(false)
    setPhase('idle')
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-8"
      style={{ background: '#0b0b14' }}>
      <button onClick={onClose}
        className="absolute top-5 right-6 text-white/40 text-4xl leading-none" aria-label="Close">✕</button>

      {phase === 'running' && (
        <div className="text-white/40 text-lg font-bold">running — you can close this, it keeps going</div>
      )}
      {autoStopped && phase === 'idle' && (
        <div className="text-amber-400 text-lg font-bold">Stopped automatically after 2 hours</div>
      )}

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
