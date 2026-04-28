'use client'
import { useState, useEffect } from 'react'

export type Routine = 'morning' | 'afternoon'

export function useRoutine(afternoonTime = '12:00'): Routine {
  const getRoutine = (): Routine => {
    const now = new Date()
    const [h, m] = afternoonTime.split(':').map(Number)
    return now.getHours() * 60 + now.getMinutes() >= h * 60 + m ? 'afternoon' : 'morning'
  }

  const [routine, setRoutine] = useState<Routine>(getRoutine)

  useEffect(() => {
    const t = setInterval(() => setRoutine(getRoutine()), 60_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [afternoonTime])

  return routine
}
