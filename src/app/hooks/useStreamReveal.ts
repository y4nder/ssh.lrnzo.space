import { useEffect, useMemo, useState } from "react"
import { TYPE_MAX_TICKS, TYPE_MIN_CHARS, TYPE_TICK_MS } from "./useTypewriter"

// Scroll-streamed typewriter over a windowed line array. Where useTypewriter
// treats scroll as a *skip*, this treats it as a *trigger*: lines type in the
// first time the viewport exposes them, and everything already seen renders
// full forever after. State is the in-flight range [from, to) plus a char
// budget — `from` is the reveal watermark (all lines before it are latched
// full), `to` is the furthest viewport bottom ever reached.
//
// Scrolling down mid-animation extends the range and advances `from` past
// lines that left the top (they latch full — off-screen typing would tease).
// A jump (G) snaps `from` to the new viewport start, so only visible lines
// animate. Scrolling up never touches state: already-revealed is instant.
// resetKey identifies the wrap width: when it changes the line indices are
// meaningless, so the current viewport latches revealed with no re-animation.
export function useStreamReveal(
  lineLengths: number[],
  viewportStart: number,
  viewportEnd: number,
  resetKey: string | number,
): { shownFor: (i: number) => number; activeLine: number; done: boolean } {
  // Prefix char sums so any range total is O(1): prefix[i] = chars in [0, i).
  const prefix = useMemo(() => {
    const p = new Array<number>(lineLengths.length + 1)
    p[0] = 0
    for (let i = 0; i < lineLengths.length; i++) p[i + 1] = p[i]! + lineLengths[i]!
    return p
  }, [lineLengths])

  const [st, setSt] = useState({ resetKey, from: 0, to: viewportEnd, shown: 0 })
  // Adjust during render (not in an effect) so a jump never flashes the new
  // viewport's full text for a frame. The reset check must win: a resize that
  // lands together with a scroll latches, not animates, the re-wrapped lines.
  if (st.resetKey !== resetKey) {
    setSt({ resetKey, from: viewportEnd, to: viewportEnd, shown: Number.MAX_SAFE_INTEGER })
  } else if (viewportEnd > st.to) {
    const prevTotal = prefix[st.to]! - prefix[st.from]!
    const wasDone = st.shown >= prevTotal
    // Lines that scrolled off the top latch full; rebase the budget so the
    // typing position holds steady instead of jumping with the watermark.
    const base = wasDone ? st.to : st.from
    const from = Math.max(base, Math.min(viewportStart, viewportEnd))
    const shown = wasDone ? 0 : Math.max(0, st.shown - (prefix[from]! - prefix[st.from]!))
    setSt({ resetKey, from, to: viewportEnd, shown })
  }

  const total = prefix[st.to]! - prefix[st.from]!
  const done = st.shown >= total
  // Scale speed with the pending block so a full first screen and a single
  // scrolled-in line both feel snappy, without shrinking the tick.
  const charsPerTick = Math.max(TYPE_MIN_CHARS, Math.ceil(total / TYPE_MAX_TICKS))

  // Interval is cleaned up on unmount — session.ts unmounts the root on SSH
  // disconnect, and a leaked timer would keep firing setState in the shared
  // server process. Completion latches to MAX_SAFE_INTEGER so a height resize
  // that changes the viewport can't un-complete finished text.
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

  const budget = Math.min(st.shown, total)
  const shownFor = (i: number): number => {
    const len = lineLengths[i] ?? 0
    if (i < st.from) return len
    if (i >= st.to) return 0
    return Math.max(0, Math.min(len, budget - (prefix[i]! - prefix[st.from]!)))
  }

  let activeLine = -1
  if (!done) {
    for (let i = Math.max(st.from, viewportStart); i < st.to; i++) {
      if (shownFor(i) < (lineLengths[i] ?? 0)) {
        activeLine = i
        break
      }
    }
  }
  return { shownFor, activeLine, done }
}
