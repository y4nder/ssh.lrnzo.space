import { useEffect, useMemo, useState } from "react"

export const TYPE_TICK_MS = 35 // ~28 updates/s max, and only while animating
export const TYPE_MIN_CHARS = 8 // >= ~114 chars/s (splash types at 14 chars/s)
export const TYPE_MAX_TICKS = 30 // any block completes within ~1.75s

// Typewriter reveal over pre-wrapped physical lines (one terminal row each).
// A single character budget grows across the whole block, so callers keep a
// frozen row grid and nothing below the text reflows mid-animation.
// resetKey identifies the item: change it to restart from zero. skipKey
// changing (same resetKey) snaps to the full text — wire it to a scroll
// offset so any scroll mid-animation completes instead of teasing.
export function useTypewriter(
  lines: string[],
  resetKey: string | number,
  skipKey: string | number = 0,
): { lines: string[]; done: boolean; activeLine: number } {
  const total = useMemo(() => lines.reduce((a, l) => a + l.length, 0), [lines])
  const [st, setSt] = useState({ resetKey, skipKey, shown: 0 })
  // Adjust during render (not in an effect) so an item switch never flashes
  // the new item's full text for a frame. The reset check must win: an item
  // change that lands together with a skipKey change restarts, not skips.
  if (st.resetKey !== resetKey) setSt({ resetKey, skipKey, shown: 0 })
  else if (st.skipKey !== skipKey) setSt({ resetKey, skipKey, shown: Number.MAX_SAFE_INTEGER })

  const done = st.shown >= total
  // Scale speed with length so short previews stay snappy and long records
  // still finish fast, without shrinking the tick (SSH pushes every frame).
  const charsPerTick = Math.max(TYPE_MIN_CHARS, Math.ceil(total / TYPE_MAX_TICKS))

  // Interval is cleaned up on unmount — session.ts unmounts the root on SSH
  // disconnect, and a leaked timer would keep firing setState in the shared
  // server process. Completion latches to MAX_SAFE_INTEGER so a resize that
  // rewraps lines (slightly different total) can't un-complete finished text.
  useEffect(() => {
    if (done) return
    const timer = setInterval(() => {
      setSt((s) => {
        const next = s.shown + charsPerTick
        return { ...s, shown: next >= total ? Number.MAX_SAFE_INTEGER : next }
      })
    }, TYPE_TICK_MS)
    return () => clearInterval(timer)
  }, [done, charsPerTick, total])

  let budget = Math.min(st.shown, total)
  let activeLine = -1
  const out = lines.map((line, i) => {
    const take = Math.min(line.length, Math.max(0, budget))
    budget -= line.length
    if (activeLine === -1 && take < line.length) activeLine = i
    return line.slice(0, take)
  })
  return { lines: out, done, activeLine: done ? -1 : activeLine }
}
