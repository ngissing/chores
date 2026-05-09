'use client'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export interface Member {
  id: number
  name: string
  age: number
  colour: string
  photo_path: string | null
  point_value_cents: number
  streak_days: number
  appearance: string
}

export function useMembers() {
  const { data, error, mutate } = useSWR<Member[]>('/api/members', fetcher)
  return { members: data ?? [], loading: !data && !error, mutate }
}
