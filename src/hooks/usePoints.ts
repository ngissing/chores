'use client'
import useSWR from 'swr'
import { centsToDisplay } from '@/lib/points'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function usePoints(memberId: number | null) {
  const { data, isLoading, mutate } = useSWR<{ bucket: string; balance_cents: number }[]>(
    memberId ? `/api/points?member_id=${memberId}` : null,
    fetcher,
    { refreshInterval: 5000 }
  )

  const get = (bucket: string) =>
    (data ?? []).find((b) => b.bucket === bucket)?.balance_cents ?? 0

  return {
    unallocated: get('unallocated'),
    spend: get('spend'),
    save: get('save'),
    give: get('give'),
    unallocatedDisplay: centsToDisplay(get('unallocated')),
    spendDisplay: centsToDisplay(get('spend')),
    saveDisplay: centsToDisplay(get('save')),
    giveDisplay: centsToDisplay(get('give')),
    isLoading,
    mutate,
  }
}
