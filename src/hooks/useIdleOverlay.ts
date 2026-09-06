'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Shows an overlay after `idleMinutes` of no pointer/keyboard activity,
 * but only while `active` is true. dismiss() hides it and restarts the timer.
 * When `active` flips to false, any visible overlay is hidden immediately.
 */
export function useIdleOverlay(idleMinutes: number, active: boolean) {
  const [visible, setVisible] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  const arm = useCallback(() => {
    clear()
    if (!active) return
    timer.current = setTimeout(() => setVisible(true), Math.max(1, idleMinutes) * 60_000)
  }, [idleMinutes, active])

  const dismiss = useCallback(() => {
    setVisible(false)
    arm()
  }, [arm])

  // Hide immediately and disarm when the feature becomes inactive.
  useEffect(() => {
    if (!active) {
      setVisible(false)
      clear()
    } else {
      arm()
    }
  }, [active, arm])

  // Reset the idle timer on activity, but not while the overlay is showing
  // (its own dismiss handles that; ignoring events here avoids double-arming).
  useEffect(() => {
    if (!active) return
    const onActivity = () => {
      if (!visible) arm()
    }
    const events = ['pointerdown', 'keydown', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    return () => events.forEach((e) => window.removeEventListener(e, onActivity))
  }, [active, visible, arm])

  useEffect(() => () => clear(), [])

  return { visible, dismiss }
}
