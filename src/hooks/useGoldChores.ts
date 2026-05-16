'use client'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export interface GoldChore {
  id: number
  name: string
  description: string | null
  points: number
  image_path: string | null
  image_status: 'pending' | 'ready' | 'failed'
  status: 'available' | 'awarded'
  awarded_to_member_id: number | null
  awarded_at: string | null
  created_at: string
}

export function useGoldChores() {
  const { data, mutate } = useSWR<GoldChore[]>('/api/gold-chores', fetcher, {
    refreshInterval: 5000,
  })

  const allGoldChores = data ?? []
  const goldChores = allGoldChores.filter((c) => c.status === 'available')

  return { goldChores, allGoldChores, mutate }
}
