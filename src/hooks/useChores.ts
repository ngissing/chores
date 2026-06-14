'use client'
import useSWR from 'swr'
import { isDayEnabled, isNoteVisible } from '@/lib/chores'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export interface Chore {
  id: number
  name: string
  image_path: string | null
  image_status: 'pending' | 'ready' | 'failed'
  points: number
  routine: 'morning' | 'afternoon' | 'both'
  member_ids: number[]
  days_of_week: number
  note_text: string
  note_color: string
  note_days_of_week: number
  noteVisible: boolean
}

export interface Completion {
  id: number
  chore_id: number
  member_id: number
  date: string
}

export function useChores(
  memberId: number | null,
  routine: 'morning' | 'afternoon',
  date: string
) {
  const { data: allChores, mutate: mutateChores } = useSWR<Omit<Chore, 'noteVisible'>[]>(
    memberId ? `/api/chores?member_id=${memberId}` : '/api/chores',
    fetcher
  )
  const { data: completions, mutate: mutateCompletions } = useSWR<Completion[]>(
    memberId ? `/api/completions?date=${date}&member_id=${memberId}` : null,
    fetcher,
    { refreshInterval: 5000 }
  )

  const dow = new Date().getDay() // 0 = Sunday … 6 = Saturday, local time

  const chores: Chore[] = (allChores ?? [])
    .filter(
      (c) =>
        memberId !== null &&
        c.member_ids.includes(memberId) &&
        (c.routine === routine || c.routine === 'both') &&
        isDayEnabled(c.days_of_week, dow)
    )
    .map((c) => ({
      ...c,
      noteVisible: isNoteVisible(c.note_text, c.note_days_of_week, dow),
    }))

  const completedIds = new Set((completions ?? []).map((c) => c.chore_id))

  return { chores, completedIds, mutateChores, mutateCompletions }
}
