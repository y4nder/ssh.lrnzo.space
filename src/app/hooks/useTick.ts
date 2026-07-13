import { useEffect, useState } from "react"

// Interval-driven frame counter for blink/typewriter animations. The interval
// is cleaned up on unmount — session.ts unmounts the root on SSH disconnect,
// and a leaked timer would keep firing setState in the shared server process.
export function useTick(intervalMs: number, running = true): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setTick((n) => n + 1), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs, running])
  return tick
}
