import { useEffect, useState } from "react"
import { BURST_MS } from "./useGlitchBurst"

/**
 * Gap between passes, timed so a three-ink cover finishes just inside a glitch
 * burst.
 *
 * `t` fires a BURST_MS full-screen burst (App.switchTheme) and the cover
 * re-registers underneath it. With the first ink landing on contact, the third
 * lands at 2x this — a hair under BURST_MS, so the last pass is already down as
 * the burst clears and the two read as one effect rather than as an animation
 * that outlived its cover.
 */
export const INK_PASS_MS = Math.floor(BURST_MS / 2) - 10

// Screenprint registration: the cover's inks lay down one pass at a time,
// widest coverage first (quantize() sorts the palette that way). Returns how
// many passes have printed; MusicPage feeds that to printedSpans().
//
// The first ink lands ON CONTACT, not one interval later: starting at zero
// held the slot blank for INK_PASS_MS before anything appeared, which read as
// the page lagging rather than as a press running.
//
// Latches at `inks` so a re-render mid-print can't rewind the press, and
// replays whenever `resetKey` changes — wire it to the track, the theme and
// whether the art has actually arrived. The interval is cleaned up on unmount:
// one Bun process serves every SSH session, and a leaked timer would keep
// firing setState long after the visitor disconnected.
export function useInkPasses(inks: number, resetKey: string | number): number {
  const [st, setSt] = useState({ resetKey, printed: 1 })
  // Adjust during render (not in an effect) so a replay restarts from the first
  // pass instead of flashing the finished cover for one frame.
  if (st.resetKey !== resetKey) setSt({ resetKey, printed: 1 })

  const done = st.printed >= inks
  useEffect(() => {
    if (done) return
    const timer = setInterval(() => setSt((s) => ({ ...s, printed: s.printed + 1 })), INK_PASS_MS)
    return () => clearInterval(timer)
  }, [done, st.resetKey])

  return Math.min(st.printed, inks)
}
