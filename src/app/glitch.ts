import { RGBA, type OptimizedBuffer } from "@opentui/core"

// Brutalist glitch: full-row events only, theme colors only, house glyphs
// only, hard steps only. The burst runs on a fixed EPISODE_MS cadence —
// HEAVY_EPISODES violent steps, then sparse aftershocks until the hook cuts
// it off — with random composition inside each step: rows shift, mirror,
// slam to a solid accent bar, or break into the banner's own half-blocks.
// The paint color is whatever accent trigger() is handed — App passes the
// INCOMING accent on a theme switch, so the new signal punches in with it.
//
// Buffer cell encoding (proven by core's own DistortionEffect): char is a
// Uint32 codepoint plane, fg/bg are 4 uint16s per cell with r/g/b stored
// 0–255 and alpha in the low byte of the 4th — writes must preserve it.

export const EPISODE_MS = 80
export const HEAVY_EPISODES = 3

// The screen breaks into its own material: banner half-blocks + the ✱ motif.
const GLYPHS = ["█", "▀", "▄", "✱"].map((c) => c.codePointAt(0)!)
const BAR_GLYPH = "█".codePointAt(0)!
const STATIC_DENSITY = 0.2
const MAX_SHIFT = 10

type RowGlitch =
  | { y: number; kind: "shift"; amount: number }
  | { y: number; kind: "flip" }
  | { y: number; kind: "bar" }
  | { y: number; kind: "static"; cells: Array<{ x: number; glyph: number }> }

export class BrutalGlitch {
  private paint: [number, number, number]
  private episodeAge = 0
  private episode = -1
  private active: RowGlitch[] = []

  constructor(accentHex: string) {
    this.paint = RGBA.fromHex(accentHex).toInts().slice(0, 3) as [number, number, number]
  }

  // Re-trigger mid-burst: adopt the new accent and restart the cadence so
  // spamming `t` stays in the heavy phase instead of stacking effects.
  restart(accentHex: string) {
    this.paint = RGBA.fromHex(accentHex).toInts().slice(0, 3) as [number, number, number]
    this.episodeAge = 0
    this.episode = -1
    this.active = []
  }

  private roll(width: number, height: number) {
    this.episode++
    this.active = []
    const heavy = this.episode < HEAVY_EPISODES
    const rows = heavy ? 2 + Math.floor(Math.random() * 4) : 1 + Math.floor(Math.random() * 2)
    for (let i = 0; i < rows; i++) {
      const y = Math.floor(Math.random() * height)
      if (this.active.some((g) => g.y === y)) continue
      // Sparse aftershocks are structural only — no bars, no mirror slabs.
      const kindRoll = Math.random()
      if (heavy && kindRoll < 0.05) {
        this.active.push({ y, kind: "bar" })
      } else if (heavy && kindRoll < 0.4) {
        this.active.push({ y, kind: "flip" })
      } else if (kindRoll < (heavy ? 0.7 : 0.5)) {
        const amount = (2 + Math.floor(Math.random() * (MAX_SHIFT - 1))) * (Math.random() < 0.5 ? -1 : 1)
        this.active.push({ y, kind: "shift", amount })
      } else {
        const cells: Array<{ x: number; glyph: number }> = []
        for (let x = 0; x < width; x++) {
          if (Math.random() < STATIC_DENSITY)
            cells.push({ x, glyph: GLYPHS[Math.floor(Math.random() * GLYPHS.length)]! })
        }
        this.active.push({ y, kind: "static", cells })
      }
    }
  }

  apply(buffer: OptimizedBuffer, deltaTime: number) {
    const width = buffer.width
    const height = buffer.height
    const buf = buffer.buffers
    this.episodeAge += deltaTime
    if (this.episode === -1 || this.episodeAge >= EPISODE_MS) {
      this.episodeAge = 0
      this.roll(width, height)
    }

    const [pr, pg, pb] = this.paint
    let tmpChar: Uint32Array | null = null
    let tmpFg: Uint16Array | null = null
    let tmpBg: Uint16Array | null = null
    let tmpAttr: Uint32Array | null = null

    for (const glitch of this.active) {
      const y = glitch.y
      if (y < 0 || y >= height) continue
      const base = y * width

      if (glitch.kind === "shift" || glitch.kind === "flip") {
        if (!tmpChar) {
          tmpChar = new Uint32Array(width)
          tmpFg = new Uint16Array(width * 4)
          tmpBg = new Uint16Array(width * 4)
          tmpAttr = new Uint32Array(width)
        }
        tmpChar.set(buf.char.subarray(base, base + width))
        tmpFg!.set(buf.fg.subarray(base * 4, (base + width) * 4))
        tmpBg!.set(buf.bg.subarray(base * 4, (base + width) * 4))
        tmpAttr!.set(buf.attributes.subarray(base, base + width))
        for (let x = 0; x < width; x++) {
          const srcX =
            glitch.kind === "shift" ? (x - glitch.amount + width * 2) % width : width - 1 - x
          const dest = base + x
          buf.char[dest] = tmpChar[srcX]!
          buf.attributes[dest] = tmpAttr![srcX]!
          buf.fg.set(tmpFg!.subarray(srcX * 4, srcX * 4 + 4), dest * 4)
          buf.bg.set(tmpBg!.subarray(srcX * 4, srcX * 4 + 4), dest * 4)
        }
      } else if (glitch.kind === "bar") {
        for (let x = 0; x < width; x++) {
          const dest = base + x
          buf.char[dest] = BAR_GLYPH
          const c = dest * 4
          buf.fg[c] = pr
          buf.fg[c + 1] = pg
          buf.fg[c + 2] = pb
          buf.fg[c + 3] = buf.fg[c + 3]! & 255
        }
      } else {
        for (const cell of glitch.cells) {
          if (cell.x >= width) continue
          const dest = base + cell.x
          buf.char[dest] = cell.glyph
          const c = dest * 4
          buf.fg[c] = pr
          buf.fg[c + 1] = pg
          buf.fg[c + 2] = pb
          buf.fg[c + 3] = buf.fg[c + 3]! & 255
        }
      }
    }
  }
}
