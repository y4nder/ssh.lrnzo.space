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
//
// Change `resetKey` to replay, as useTraceReveal does: the music page flips
// between cover and QR in one slot, and the QR has to strobe in on every flip
// rather than only the first. Callers that reveal once and stay revealed omit
// it and keep the latch.
export function useFlashIn(trigger: boolean, resetKey: string | number = ""): FlashStage {
  const [st, setSt] = useState({ resetKey, frame: -1 })
  // Adjust during render (not in an effect) so a replay starts dark instead of
  // flashing the settled element for one frame.
  if (st.resetKey !== resetKey) setSt({ resetKey, frame: -1 })

  const frame = st.frame
  const settled = frame >= SEQUENCE.length
  useEffect(() => {
    if (!trigger || settled) return
    setSt((s) => (s.frame === -1 ? { ...s, frame: 0 } : s)) // first pop lands this frame
    const timer = setInterval(() => setSt((s) => ({ ...s, frame: s.frame + 1 })), FLASH_FRAME_MS)
    return () => clearInterval(timer)
  }, [trigger, settled, st.resetKey])
  if (frame === -1) return "hidden"
  if (settled) return "shown"
  return SEQUENCE[frame]!
}
