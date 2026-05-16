'use client'
import { useState } from 'react'
import MembersTab from './MembersTab'
import ChoresTab from './ChoresTab'
import ScheduleTab from './ScheduleTab'
import PointsPayTab from './PointsPayTab'
import ChangePinTab from './ChangePinTab'
import GoldTab from './GoldTab'

type Tab = 'members' | 'chores' | 'schedule' | 'points' | 'pin' | 'gold'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'members',  label: 'Members',      icon: '👨‍👩‍👧‍👦' },
  { id: 'chores',   label: 'Chores',       icon: '📋' },
  { id: 'gold',     label: 'Gold Chores',  icon: '⭐' },
  { id: 'schedule', label: 'Schedule',     icon: '🕐' },
  { id: 'points',   label: 'Points & Pay', icon: '💰' },
  { id: 'pin',      label: 'Change PIN',   icon: '🔒' },
]

export default function AdminShell() {
  const [tab, setTab] = useState<Tab>('members')

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Sidebar */}
      <div className="flex flex-col gap-1 p-3 flex-shrink-0 w-44"
        style={{ background: 'rgba(0,0,0,0.3)', borderRight: '1px solid rgba(255,255,255,0.07)' }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold text-left transition-colors"
            style={{
              background: tab === t.id ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: tab === t.id ? 'white' : 'rgba(255,255,255,0.5)',
            }}>
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {tab === 'members'  && <MembersTab />}
        {tab === 'chores'   && <ChoresTab />}
        {tab === 'gold'     && <GoldTab />}
        {tab === 'schedule' && <ScheduleTab />}
        {tab === 'points'   && <PointsPayTab />}
        {tab === 'pin'      && <ChangePinTab />}
      </div>
    </div>
  )
}
