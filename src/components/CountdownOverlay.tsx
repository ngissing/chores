'use client'
import { useEffect, useState } from 'react'
import { CountdownSettings, computeCountdownState } from '@/lib/countdown'

function polar(cx: number, cy: number, r: number, p: number) {
  const a = 2 * Math.PI * p
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) }
}

function wedge(cx: number, cy: number, r: number, p0: number, p1: number) {
  const a = polar(cx, cy, r, p0)
  const b = polar(cx, cy, r, p1)
  const large = p1 - p0 > 0.5 ? 1 : 0
  return `M ${cx} ${cy} L ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)} Z`
}

function fmtClock(d: Date) {
  let h = d.getHours() % 12
  if (h === 0) h = 12
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fmtTarget(minutes: number) {
  let h = Math.floor(minutes / 60) % 12
  if (h === 0) h = 12
  return `${h}:${String(minutes % 60).padStart(2, '0')}`
}

export default function CountdownOverlay({
  settings,
  onDismiss,
  previewAt,
}: {
  settings: CountdownSettings
  onDismiss: () => void
  previewAt?: Date
}) {
  const [liveNow, setLiveNow] = useState(() => new Date())
  useEffect(() => {
    if (previewAt) return
    const t = setInterval(() => setLiveNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [previewAt])
  const now = previewAt ?? liveNow

  const state = computeCountdownState(settings, now)
  const cx = 150
  const cy = 150
  const r = 130
  const f = state.elapsedFraction

  // Dismiss on click — the LAST event of a tap. Dismissing on pointerdown
  // unmounts the overlay mid-tap, so the following click lands on whatever
  // control is revealed underneath ("click-through"). Handling click means the
  // whole tap completes on the overlay and nothing beneath it is activated.
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onDismiss()
  }

  return (
    <div
      onClick={handleClick}
      className="fixed inset-0 flex flex-col items-center justify-center gap-6"
      style={{ zIndex: 9999, background: '#0b0b14', touchAction: 'none' }}
    >
      {state.phase === 'counting' && (
        <div className="text-white font-bold" style={{ fontFamily: 'var(--font-fredoka)', fontSize: '4rem', lineHeight: 1 }}>
          {fmtClock(now)}
        </div>
      )}

      <svg width="300" height="300" viewBox="0 0 300 300" aria-hidden="true">
        <circle cx={cx} cy={cy} r={r} fill="#15151f" stroke="#26263a" strokeWidth="3" />
        {f <= 0 ? (
          <circle cx={cx} cy={cy} r={r} fill={settings.colorRemaining} />
        ) : f >= 1 ? (
          <circle cx={cx} cy={cy} r={r} fill={settings.colorElapsed} />
        ) : (
          <>
            <path d={wedge(cx, cy, r, 0, f)} fill={settings.colorElapsed} />
            <path d={wedge(cx, cy, r, f, 1)} fill={settings.colorRemaining} />
          </>
        )}
        {[0, 0.25, 0.5, 0.75].map((p) => {
          const o = polar(cx, cy, r, p)
          const i = polar(cx, cy, r - 12, p)
          return <line key={p} x1={o.x} y1={o.y} x2={i.x} y2={i.y} stroke="#ffffff" strokeWidth="3" opacity="0.35" />
        })}
        {state.phase === 'counting' && (
          <>
            {(() => {
              const h = polar(cx, cy, r - 16, f)
              return <line x1={cx} y1={cy} x2={h.x} y2={h.y} stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
            })()}
            <circle cx={cx} cy={cy} r="10" fill="#ffffff" />
          </>
        )}
      </svg>

      {state.phase === 'counting' ? (
        <div className="text-center">
          <div className="text-white font-bold" style={{ fontFamily: 'var(--font-fredoka)', fontSize: '1.6rem' }}>
            School by {fmtTarget(settings.targetMinutes)}
          </div>
          <div style={{ color: settings.colorRemaining, fontSize: '1.2rem', fontWeight: 700 }}>
            {state.minutesLeft} min left
          </div>
        </div>
      ) : (
        <div className="text-white font-bold" style={{ fontFamily: 'var(--font-fredoka)', fontSize: '2.5rem' }}>
          Time&apos;s up!
        </div>
      )}

      <div className="text-white/30 text-sm">tap anywhere to close</div>
    </div>
  )
}
