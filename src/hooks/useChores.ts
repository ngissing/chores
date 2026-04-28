'use client'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export interface Chore {
  id: number
  name: string
  image_path: string | null
  image_status: 'pending' | 'ready' | 'failed'
  points: number
  routine: 'morning' | 'afternoon' | 'both'
  member_ids: number[]
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
  const { data: allChores, mutate: mutateChores } = useSWR<Chore[]>('/api/chores', fetcher)
  const { data: completions, mutate: mutateCompletions } = useSWR<Completion[]>(
    memberId ? `/api/completions?date=${date}&member_id=${memberId}` : null,
    fetcher,
    { refreshInterval: 5000 }
  )

  const chores = (allChores ?? []).filter(
    (c) =>
      memberId !== null &&
      c.member_ids.includes(memberId) &&
      (c.routine === routine || c.routine === 'both')
  )

  const completedIds = new Set((completions ?? []).map((c) => c.chore_id))

  return { chores, completedIds, mutateChores, mutateCompletions }
}
