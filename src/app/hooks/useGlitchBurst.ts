import { useCallback, useEffect, useRef } from "react"
import { useRenderer } from "@opentui/react"
import type { OptimizedBuffer } from "@opentui/core"
import { BrutalGlitch } from "../glitch"

export const BURST_MS = 400

type PostFn = (buffer: OptimizedBuffer, deltaTime: number) => void

// Brief brutalist glitch burst over the whole screen: trigger() attaches a
// BrutalGlitch post-process pass and holds the render loop live for
// BURST_MS, then detaches and paints one clean frame. `accentHex` is the
// color glitch rows paint with — App passes the incoming accent on a theme
// switch and the current accent on console open.
// Triggering mid-burst restarts the cadence with the new accent instead of
// stacking a second effect. Everything is torn down on unmount: one Bun
// process serves all SSH sessions, and a leaked post-process fn or
// live-request would keep the loop running (and glitching) after
// disconnect.
export function useGlitchBurst(): (accentHex: string) => void {
  const renderer = useRenderer()
  const active = useRef<{
    effect: BrutalGlitch
    fn: PostFn
    timer: ReturnType<typeof setTimeout>
  } | null>(null)

  const stop = useCallback(() => {
    if (!active.current) return
    clearTimeout(active.current.timer)
    renderer.removePostProcessFn(active.current.fn)
    renderer.dropLive()
    active.current = null
    renderer.requestRender() // repaint the last glitched frame clean
  }, [renderer])

  useEffect(() => stop, [stop])

  return useCallback(
    (accentHex: string) => {
      if (active.current) {
        clearTimeout(active.current.timer)
        active.current.effect.restart(accentHex)
        active.current.timer = setTimeout(stop, BURST_MS)
        return
      }
      const effect = new BrutalGlitch(accentHex)
      const fn: PostFn = (buffer, deltaTime) => effect.apply(buffer, deltaTime)
      renderer.addPostProcessFn(fn)
      renderer.requestLive()
      active.current = { effect, fn, timer: setTimeout(stop, BURST_MS) }
    },
    [renderer, stop],
  )
}
