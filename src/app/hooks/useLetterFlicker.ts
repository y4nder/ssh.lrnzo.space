import { useEffect, useState } from "react"

// Entrance: each letter catches at a random moment within the scatter
// window, stutters as it warms up, and holds — tubes powering on unevenly.
const ENTRANCE_SCATTER_MS = 400
// Ambient broken-sign cadence after entry: long steady stretches, then one
// letter stutters.
const IDLE_MIN_MS = 1000
const IDLE_MAX_MS = 4000
const STUTTER_MIN_MS = 40
const STUTTER_MAX_MS = 120
const OUTAGE_MIN_MS = 400
const OUTAGE_MAX_MS = 700
const OUTAGE_CHANCE = 0.15

// "off" = dark (opacity 0), "flicker" = mid-episode spark (accent color),
// "lit" = settled steady (fg color). Every relight inside an episode is a
// "flicker"; episodes end with a settle beat back to "lit".
export type LetterState = "off" | "flicker" | "lit"

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

// Per-letter flicker for the masthead. Letters start dark and flicker-in on
// mount (random scatter, ~1s total); once every letter has caught, a rare
// ambient stutter continues — each idle gap a random letter abruptly cuts
// out and snaps back, occasionally staying dark for a longer outage. While
// a letter is sparking it reports "flicker" so the UI can paint it in the
// theme accent before it settles. A `resetKey` change (e.g. the theme name)
// snaps every letter dark and replays the whole entrance. Off/on is a hard
// cut (no fade); every sequence ends with the letter lit. Timers are
// chained setTimeouts (nothing ticks while idle) and all are torn down on
// unmount: one Bun process serves all SSH sessions, and a leaked timer
// would keep firing setState after disconnect.
export function useLetterFlicker(count: number, resetKey?: unknown): LetterState[] {
  const [letters, setLetters] = useState<LetterState[]>(() => Array(count).fill("off"))

  useEffect(() => {
    let cancelled = false
    const timers = new Set<ReturnType<typeof setTimeout>>()

    // Re-arm: on a resetKey replay all letters must drop dark before the
    // new entrance; on first mount they already are (skip the extra render).
    setLetters((prev) => (prev.every((s) => s === "off") ? prev : Array(count).fill("off")))

    const after = (ms: number, fn: () => void) => {
      const t = setTimeout(() => {
        timers.delete(t)
        if (!cancelled) fn()
      }, ms)
      timers.add(t)
    }

    const setLetter = (i: number, state: LetterState) =>
      setLetters((prev) => {
        if (prev[i] === state) return prev
        const next = [...prev]
        next[i] = state
        return next
      })

    // [delay-before, letter-state] steps; each schedules the next.
    const runSteps = (i: number, steps: Array<[number, LetterState]>, done: () => void) => {
      const [head, ...rest] = steps
      if (!head) return done()
      after(head[0], () => {
        setLetter(i, head[1])
        runSteps(i, rest, done)
      })
    }

    const stutterSteps = (n: number): Array<[number, LetterState]> => {
      const steps: Array<[number, LetterState]> = []
      for (let s = 0; s < n; s++) {
        steps.push(
          [rand(STUTTER_MIN_MS, STUTTER_MAX_MS), "off"],
          [rand(STUTTER_MIN_MS, STUTTER_MAX_MS), "flicker"],
        )
      }
      return steps
    }

    const settle = (): [number, LetterState] => [rand(STUTTER_MIN_MS, STUTTER_MAX_MS), "lit"]

    const idle = () => {
      after(rand(IDLE_MIN_MS, IDLE_MAX_MS), () => {
        const i = Math.floor(Math.random() * count)
        const steps: Array<[number, LetterState]> =
          Math.random() < OUTAGE_CHANCE
            ? [[0, "off"], [rand(OUTAGE_MIN_MS, OUTAGE_MAX_MS), "flicker"]]
            : stutterSteps(Math.random() < 0.5 ? 1 : 2)
        steps.push(settle())
        runSteps(i, steps, idle)
      })
    }

    // Entrance: every letter runs its own catch-and-stutter chain
    // concurrently; the ambient loop starts once the last one settles.
    let pending = count
    for (let i = 0; i < count; i++) {
      const steps: Array<[number, LetterState]> = [
        [0, "flicker"],
        ...stutterSteps(1 + Math.floor(Math.random() * 2)),
        settle(),
      ]
      after(rand(0, ENTRANCE_SCATTER_MS), () =>
        runSteps(i, steps, () => {
          if (--pending === 0) idle()
        }),
      )
    }

    return () => {
      cancelled = true
      for (const t of timers) clearTimeout(t)
    }
  }, [count, resetKey])

  return letters
}
