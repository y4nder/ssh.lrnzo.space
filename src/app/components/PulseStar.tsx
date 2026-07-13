import { useEffect, useRef, useState } from "react"
import { useTheme } from "../theme"

// Accent star that rests as ✱ and plays one short pulse burst through the
// frames before settling again. Bursts fire on an idle heartbeat (`every`)
// and whenever `pulseKey` changes (e.g. the active tab). Triggers are
// throttled: while a burst is mid-flight new triggers are ignored, so
// spamming tab never stacks timers — at most one interval exists. Rendered
// as a <span>, so it must live inside <text>. Timers are effect-scoped —
// session.ts unmounts the root on SSH disconnect and a leaked timer would
// keep firing setState.
const FRAMES = ["✶", "✸", "✹", "✺", "✹", "✷", "✶"]
const REST = "✱"

export function PulseStar({
  every = 6000,
  frameMs = 90,
  pulseKey,
}: {
  every?: number
  frameMs?: number
  pulseKey?: unknown
}) {
  const theme = useTheme()
  const [frame, setFrame] = useState(-1) // -1 = resting
  const burstRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startBurst = () => {
    if (burstRef.current) return // mid-pulse; throttle the trigger
    let i = 0
    setFrame(0)
    burstRef.current = setInterval(() => {
      i++
      if (i >= FRAMES.length) {
        setFrame(-1)
        if (burstRef.current) clearInterval(burstRef.current)
        burstRef.current = null
      } else {
        setFrame(i)
      }
    }, frameMs)
  }

  // Idle heartbeat. Its cleanup also clears any in-flight burst on unmount.
  useEffect(() => {
    const scheduler = setInterval(startBurst, every)
    return () => {
      clearInterval(scheduler)
      if (burstRef.current) clearInterval(burstRef.current)
      burstRef.current = null
    }
  }, [every, frameMs])

  // Pulse on trigger changes (skip the initial mount).
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    startBurst()
  }, [pulseKey])

  return <span fg={theme.accent}>{frame < 0 ? REST : FRAMES[frame]}</span>
}
