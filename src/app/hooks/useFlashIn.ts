import { useEffect, useState } from "react"

export const FLASH_FRAME_MS = 60
// Two bright pops with gaps before settling — the abrupt strobe-in cut
// motion designers use to snap an element onto screen.
const SEQUENCE: Array<"bright" | "off"> = ["bright", "off", "bright", "off"]

export type FlashStage = "hidden" | "bright" | "off" | "shown"

// Flash-in reveal: "hidden" until `trigger` flips true, then strobes through
// SEQUENCE at FLASH_FRAME_MS and settles on "shown". Settling latches — a
// later trigger=false (e.g. a resize re-running a typewriter) can't re-hide
// the element. Interval is cleaned up on unmount: one Bun process serves all
// SSH sessions, and a leaked timer would keep firing setState after
// disconnect.
export function useFlashIn(trigger: boolean): FlashStage {
  const [frame, setFrame] = useState(-1)
  const settled = frame >= SEQUENCE.length
  useEffect(() => {
    if (!trigger || settled) return
    setFrame((f) => (f === -1 ? 0 : f)) // first pop lands this frame
    const timer = setInterval(() => setFrame((f) => f + 1), FLASH_FRAME_MS)
    return () => clearInterval(timer)
  }, [trigger, settled])
  if (frame === -1) return "hidden"
  if (settled) return "shown"
  return SEQUENCE[frame]!
}
