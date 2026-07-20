import { useEffect, useState } from "react"

export const TRACE_TICK_MS = 28
const TRACE_TICKS = 24 // the line finishes drawing within ~0.7s regardless of width

// Left-to-right "plotter" reveal for the stats line chart: a column cursor
// that advances until the full width is drawn, then latches to
// MAX_SAFE_INTEGER so a resize (which rebuilds the chart with a new column
// count) can't rewind a finished trace. Change `resetKey` to replay — wire it
// to the theme name so switching palettes re-draws the line in the new accent.
// Interval is cleaned up on unmount: one Bun process serves every SSH session,
// and a leaked timer would keep firing setState after disconnect.
export function useTraceReveal(cols: number, resetKey: string | number): number {
  const [st, setSt] = useState({ resetKey, drawn: 0 })
  // Adjust during render (not in an effect) so a replay starts from a blank
  // chart instead of flashing the finished line for one frame.
  if (st.resetKey !== resetKey) setSt({ resetKey, drawn: 0 })

  const done = st.drawn >= cols
  const step = Math.max(1, Math.ceil(cols / TRACE_TICKS))

  useEffect(() => {
    if (done) return
    const timer = setInterval(() => {
      setSt((s) => {
        const next = s.drawn + step
        return { ...s, drawn: next >= cols ? Number.MAX_SAFE_INTEGER : next }
      })
    }, TRACE_TICK_MS)
    return () => clearInterval(timer)
  }, [done, step, cols])

  return Math.min(st.drawn, cols)
}
