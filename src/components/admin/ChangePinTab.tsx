'use client'
import { useState } from 'react'

type Step = 'verify' | 'new' | 'confirm'

export default function ChangePinTab() {
  const [step, setStep] = useState<Step>('verify')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleVerify = async (pin: string) => {
    const res = await fetch('/api/settings/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })
    const { ok } = await res.json() as { ok: boolean }
    if (ok) { setError(''); setCurrent(pin); setStep('new') }
    else setError('Incorrect PIN')
  }

  const handleConfirm = async (confirmPin: string) => {
    if (confirmPin !== next) { setError('PINs do not match'); return }
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'change_pin', current_pin: current, new_pin: next }),
    })
    setSuccess(true)
    setCurrent(''); setNext(''); setStep('verify')
  }

  if (success) return (
    <div className="flex flex-col items-center gap-4 mt-8">
      <div className="text-4xl">✅</div>
      <div className="text-white font-bold">PIN changed successfully</div>
      <button onClick={() => setSuccess(false)}
        className="px-4 py-2 rounded-xl text-sm font-bold text-white"
        style={{ background: '#6366f1' }}>Done</button>
    </div>
  )

  return (
    <div className="flex flex-col gap-6 max-w-xs">
      <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'var(--font-fredoka)' }}>Change PIN</h2>

      {/* Progress */}
      <div className="flex gap-2">
        {(['verify','new','confirm'] as Step[]).map((s, i) => (
          <div key={s} className="flex-1 h-1.5 rounded-full transition-colors"
            style={{ background: (['verify','new','confirm'] as Step[]).indexOf(step) >= i ? '#6366f1' : 'rgba(255,255,255,0.1)' }} />
        ))}
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}

      {step === 'verify' && (
        <PinInput label="Current PIN" onComplete={handleVerify} />
      )}
      {step === 'new' && (
        <PinInput label="New PIN (4 digits)" onComplete={(p) => { setNext(p); setStep('confirm') }} />
      )}
      {step === 'confirm' && (
        <PinInput label="Confirm new PIN" onComplete={handleConfirm} />
      )}
    </div>
  )
}

function PinInput({ label, onComplete }: {
  label: string; onComplete: (pin: string) => void
}) {
  const [pin, setPin] = useState('')
  const digits = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  const press = (d: string) => {
    if (d === '⌫') {
      setPin((p) => p.slice(0, -1))
    } else if (d && pin.length < 4) {
      const p = pin + d
      setPin(p)
      if (p.length === 4) onComplete(p)
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-sm text-white/50">{label}</div>
      <div className="flex gap-3">
        {[0,1,2,3].map((i) => (
          <div key={i} className="w-5 h-5 rounded-full border-2 border-white/40"
            style={{ background: pin.length > i ? 'white' : 'transparent' }} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {digits.map((d, i) => (
          <button key={i} onClick={() => press(d)} disabled={d === ''}
            className="w-14 h-14 rounded-2xl text-xl font-bold text-white active:scale-95 transition-transform"
            style={{ background: d ? 'rgba(255,255,255,0.1)' : 'transparent' }}>
            {d}
          </button>
        ))}
      </div>
    </div>
  )
}
