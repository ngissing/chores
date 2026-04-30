'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PinGate from '@/components/PinGate'
import AdminShell from '@/components/admin/AdminShell'

export default function AdminPage() {
  const [unlocked, setUnlocked] = useState(false)
  const router = useRouter()

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden"
      style={{ background: '#0d0d1a' }}>
      {/* Top bar */}
      <div className="flex items-center px-4 py-2 flex-shrink-0"
        style={{ background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <button onClick={() => router.push('/')}
          className="px-3 py-3 rounded-xl text-sm font-bold text-white/50 mr-3"
          style={{ background: 'rgba(255,255,255,0.09)' }}>
          ← Back
        </button>
        <span className="text-lg text-white" style={{ fontFamily: 'var(--font-fredoka)' }}>
          ⚙ Admin
        </span>
      </div>

      {unlocked ? <AdminShell /> : <div className="flex-1" />}
      {!unlocked && <PinGate onSuccess={() => setUnlocked(true)} />}
    </div>
  )
}
