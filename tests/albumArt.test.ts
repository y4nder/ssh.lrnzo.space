import { describe, expect, test } from "bun:test"
import { encode } from "jpeg-js"
import {
  decodeLuma,
  equalize,
  INK_MAX_L,
  INK_MIN_L,
  liftPalette,
  LUMA_SIZE,
  quantize,
  sniffJpeg,
  toLuma,
  toRgb,
  type Luma,
} from "../src/albumArt"

function solid(w: number, h: number, r: number, g: number, b: number): Uint8Array {
  const out = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = r
    out[i * 4 + 1] = g
    out[i * 4 + 2] = b
    out[i * 4 + 3] = 255
  }
  return out
}

function luma(values: number[]): Luma {
  return { size: Math.sqrt(values.length), data: Float32Array.from(values) }
}

describe("sniffJpeg", () => {
  test("accepts the JPEG SOI marker", () => {
    expect(sniffJpeg(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(true)
  })

  test("rejects a PNG, an HTML error page, and a runt", () => {
    expect(sniffJpeg(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false)
    expect(sniffJpeg(new TextEncoder().encode("<!DOCTYPE html>"))).toBe(false)
    expect(sniffJpeg(Uint8Array.from([0xff, 0xd8]))).toBe(false)
    expect(sniffJpeg(new Uint8Array(0))).toBe(false)
  })
})

describe("toLuma", () => {
  test("maps white to 1 and black to 0", () => {
    expect(toLuma(solid(4, 4, 255, 255, 255), 4, 4, 2).data[0]).toBeCloseTo(1, 5)
    expect(toLuma(solid(4, 4, 0, 0, 0), 4, 4, 2).data[0]).toBeCloseTo(0, 5)
  })

  test("uses Rec.709 weights", () => {
    expect(toLuma(solid(2, 2, 255, 0, 0), 2, 2, 1).data[0]).toBeCloseTo(0.2126, 4)
    expect(toLuma(solid(2, 2, 0, 255, 0), 2, 2, 1).data[0]).toBeCloseTo(0.7152, 4)
    expect(toLuma(solid(2, 2, 0, 0, 255), 2, 2, 1).data[0]).toBeCloseTo(0.0722, 4)
  })

  test("box-averages rather than point-samples when downsampling", () => {
    // Left half white, right half black, in a 4x4 collapsed to 1x1.
    const src = new Uint8Array(4 * 4 * 4)
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const v = x < 2 ? 255 : 0
        const i = (y * 4 + x) * 4
        src[i] = v
        src[i + 1] = v
        src[i + 2] = v
        src[i + 3] = 255
      }
    }
    // Nearest-neighbour would return 1 or 0; the average is 0.5.
    expect(toLuma(src, 4, 4, 1).data[0]).toBeCloseTo(0.5, 5)
  })

  test("emits a full grid of finite values", () => {
    const l = toLuma(solid(3, 5, 40, 90, 200), 3, 5, 8)
    expect(l.data.length).toBe(64)
    expect(Array.from(l.data).every((v) => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true)
  })

  test("survives a zero-sized source", () => {
    expect(toLuma(new Uint8Array(0), 0, 0, 4).data.length).toBe(16)
  })
})

describe("equalize", () => {
  test("opens up a compressed range toward the full ramp", () => {
    const size = 8
    const data = new Float32Array(size * size)
    for (let i = 0; i < data.length; i++) data[i] = 0.4 + (0.2 * i) / (data.length - 1)
    const out = equalize({ size, data })
    expect(Math.min(...out.data)).toBeLessThan(0.15)
    expect(Math.max(...out.data)).toBeGreaterThan(0.85)
  })

  test("pulls a uniformly bright image back off the ceiling", () => {
    // Without this, a bright cover clips to solid blocks with no detail.
    const size = 16
    const data = new Float32Array(size * size)
    for (let i = 0; i < data.length; i++) data[i] = 0.75 + (0.25 * i) / (data.length - 1)
    const out = equalize({ size, data })
    expect(Math.min(...out.data)).toBeLessThan(0.2)
  })

  test("keeps true black black so negative space survives", () => {
    // The cdfMin anchor. A cover that is 60% black must still render 60% empty
    // — otherwise the background dithers into noise and the art stops reading.
    const size = 8
    const data = new Float32Array(size * size)
    for (let i = 0; i < data.length; i++) data[i] = i < data.length * 0.6 ? 0 : 0.5 + i / data.length
    const before = Array.from(data).filter((v) => v === 0).length
    const out = equalize({ size, data })
    const after = Array.from(out.data).filter((v) => v === 0).length
    expect(before).toBeGreaterThan(0)
    expect(after).toBe(before)
  })

  test("leaves a flat field flat rather than filling it with NaN", () => {
    const out = equalize(luma(new Array(16).fill(0.5)))
    expect(Array.from(out.data).every((v) => v === 0.5)).toBe(true)
    expect(Array.from(out.data).every(Number.isFinite)).toBe(true)
  })

  test("is monotonic — never reorders tones", () => {
    const out = equalize(luma([0.1, 0.3, 0.5, 0.9, 0.2, 0.7, 0.4, 0.6, 0.05]))
    const pairs = [
      [0.1, 0.3],
      [0.3, 0.5],
      [0.5, 0.9],
    ]
    const src = [0.1, 0.3, 0.5, 0.9, 0.2, 0.7, 0.4, 0.6, 0.05]
    for (const [a, b] of pairs) {
      const ia = src.indexOf(a!)
      const ib = src.indexOf(b!)
      expect(out.data[ia]!).toBeLessThanOrEqual(out.data[ib]!)
    }
  })
})

describe("decodeLuma", () => {
  test("round-trips a real jpeg through the real decoder", () => {
    // Built in memory with jpeg-js's own encoder: no fixture file, no network,
    // and it exercises the exact decode path production uses.
    const w = 64
    const h = 64
    const raw = new Uint8Array(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = Math.round((x / (w - 1)) * 255)
        const i = (y * w + x) * 4
        raw[i] = v
        raw[i + 1] = v
        raw[i + 2] = v
        raw[i + 3] = 255
      }
    }
    const jpeg = encode({ data: Buffer.from(raw), width: w, height: h }, 95)

    const out = decodeLuma(new Uint8Array(jpeg.data))
    expect(out).not.toBeNull()
    expect(out!.size).toBe(LUMA_SIZE)
    expect(out!.data.length).toBe(LUMA_SIZE * LUMA_SIZE)
    // The gradient must survive as a gradient: left dark, right light.
    expect(out!.data[0]!).toBeLessThan(out!.data[LUMA_SIZE - 1]!)
    expect(Array.from(out!.data).every(Number.isFinite)).toBe(true)
  })

  test("returns null for garbage instead of throwing", () => {
    expect(decodeLuma(new TextEncoder().encode("<!DOCTYPE html><h1>404</h1>"))).toBeNull()
    expect(decodeLuma(new Uint8Array(0))).toBeNull()
    // Valid SOI marker, complete nonsense after it — this reaches the decoder.
    const fake = new Uint8Array(64)
    fake[0] = 0xff
    fake[1] = 0xd8
    fake[2] = 0xff
    expect(decodeLuma(fake)).toBeNull()
  })
})

// ---- COLOUR ----------------------------------------------------------------

function rgbGrid(size: number, at: (x: number, y: number) => [number, number, number]): Float32Array {
  const out = new Float32Array(size * size * 3)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = at(x, y)
      const i = (y * size + x) * 3
      out[i] = r
      out[i + 1] = g
      out[i + 2] = b
    }
  }
  return out
}

/** Hue in degrees, or null for a greyscale colour that has no hue. */
function hueOf(hex: string): number | null {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max - min < 0.001) return null
  let h: number
  if (max === r) h = ((g - b) / (max - min)) % 6
  else if (max === g) h = (b - r) / (max - min) + 2
  else h = (r - g) / (max - min) + 4
  return ((h * 60) % 360 + 360) % 360
}

function lightnessOf(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ]
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2
}

describe("toRgb", () => {
  test("keeps the channels a solid colour was made of", () => {
    const grid = toRgb(solid(4, 4, 40, 90, 200), 4, 4, 2)
    expect(grid[0]).toBeCloseTo(40, 4)
    expect(grid[1]).toBeCloseTo(90, 4)
    expect(grid[2]).toBeCloseTo(200, 4)
  })

  test("box-averages rather than point-samples when scaling down", () => {
    // Left half red, right half blue: a 2x1 downsample must keep them apart,
    // and a 1x1 must land on the average of the two.
    const src = new Uint8Array(4 * 4 * 4)
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const i = (y * 4 + x) * 4
        src[i] = x < 2 ? 255 : 0
        src[i + 2] = x < 2 ? 0 : 255
        src[i + 3] = 255
      }
    }
    const one = toRgb(src, 4, 4, 1)
    expect(one[0]).toBeCloseTo(127.5, 4)
    expect(one[2]).toBeCloseTo(127.5, 4)
  })

  test("agrees with toLuma, which is the same box filter weighted", () => {
    const grid = toRgb(solid(3, 5, 40, 90, 200), 3, 5, 4)
    const l = toLuma(solid(3, 5, 40, 90, 200), 3, 5, 4)
    const expected = (0.2126 * 40 + 0.7152 * 90 + 0.0722 * 200) / 255
    expect(grid.length).toBe(4 * 4 * 3)
    expect(l.data[0]).toBeCloseTo(expected, 5)
  })

  test("a zero-sized source yields a correctly sized grid of zeroes", () => {
    const grid = toRgb(new Uint8Array(0), 0, 0, 4)
    expect(grid.length).toBe(4 * 4 * 3)
    expect(grid.every((v) => v === 0)).toBe(true)
  })
})

describe("quantize", () => {
  test("recovers the two inks a two-tone cover is made of", () => {
    const size = 8
    const grid = rgbGrid(size, (x) => (x < 4 ? [200, 30, 30] : [30, 30, 200]))
    const { palette, ink } = quantize(grid, size, 2)

    expect(palette).toHaveLength(2)
    // Whichever index each landed on, the two halves must not share an ink.
    expect(ink[0]).not.toBe(ink[7])
    const red = palette[ink[0]!]!
    expect(red[0]).toBeCloseTo(200, 0)
    expect(red[2]).toBeCloseTo(30, 0)
  })

  test("is deterministic, so every session renders the same cover", () => {
    // The same reason waveform() is a pure function of the track URL: a
    // reconnect must not reshuffle the inks.
    const size = 8
    const grid = rgbGrid(size, (x, y) => [x * 30, y * 30, (x + y) * 15])
    const a = quantize(grid, size, 3)
    const b = quantize(grid, size, 3)
    expect(a.palette).toEqual(b.palette)
    expect(Array.from(a.ink)).toEqual(Array.from(b.ink))
  })

  test("survives a flat field with more inks than the cover has colours", () => {
    const size = 4
    const { palette, ink } = quantize(rgbGrid(size, () => [17, 17, 17]), size, 3)
    for (const c of palette) for (const v of c) expect(Number.isFinite(v)).toBe(true)
    for (const i of ink) expect(palette[i]).toBeDefined()
  })

  test("orders inks lightest first, the order a screenprint is pulled in", () => {
    // MusicPage registers the passes in palette order. Lightest first is both
    // how a press actually runs and the only order whose FIRST pass is visible
    // on a dark terminal — leading with a dark ink reads as a dead frame.
    const size = 8
    const grid = rgbGrid(size, (x) => (x < 3 ? [20, 20, 20] : x < 6 ? [130, 130, 130] : [240, 240, 240]))
    const { palette } = quantize(grid, size, 3)

    const ls = palette.map((c) => (Math.max(...c) + Math.min(...c)) / 2)
    expect(ls[0]!).toBeGreaterThan(ls[1]!)
    expect(ls[1]!).toBeGreaterThan(ls[2]!)
  })

  test("returns an empty palette for a degenerate grid rather than throwing", () => {
    expect(quantize(new Float32Array(0), 0, 3).palette).toEqual([])
    expect(quantize(rgbGrid(4, () => [1, 2, 3]), 4, 0).palette).toEqual([])
  })
})

describe("liftPalette", () => {
  test("lifts near-black inks into the readable band", () => {
    // A dark cover quantises to near-black inks that are invisible on a dark
    // terminal — the failure equalize() prevents for glyphs, one layer up.
    const lifted = liftPalette([
      [3, 23, 28],
      [8, 15, 18],
      [0, 15, 26],
    ])
    for (const hex of lifted) {
      expect(lightnessOf(hex)).toBeGreaterThanOrEqual(INK_MIN_L - 0.02)
      expect(lightnessOf(hex)).toBeLessThanOrEqual(INK_MAX_L + 0.02)
    }
  })

  test("preserves hue, which scaling RGB channels does not", () => {
    // Scaling [3,23,28] in RGB clips green and blue and yields a blown-out
    // cyan; the lift has to happen in HSL.
    const before = "#03171c"
    const [after] = liftPalette([[3, 23, 28]])
    expect(hueOf(after!)).toBeCloseTo(hueOf(before)!, 0)
  })

  test("keeps the darkest ink darkest", () => {
    const lifted = liftPalette([
      [200, 200, 200],
      [10, 10, 10],
      [120, 120, 120],
    ])
    expect(lightnessOf(lifted[1]!)).toBeLessThan(lightnessOf(lifted[2]!))
    expect(lightnessOf(lifted[2]!)).toBeLessThan(lightnessOf(lifted[0]!))
  })

  test("does not blow out a cover that is already well exposed", () => {
    const lifted = liftPalette([
      [18, 155, 188],
      [51, 92, 112],
      [2, 105, 175],
    ])
    for (const hex of lifted) expect(hueOf(hex)).not.toBeNull()
  })

  test("does not invent contrast a low-contrast cover does not have", () => {
    // Measured on a real sleeve that is uniformly light (#d2d9e4 #9aaac0
    // #e9eef3): stretching its narrow range across the whole band painted dark
    // navy blotches into an image that has none. The lift exists to make inks
    // READABLE, not to re-grade the artwork.
    const raw: number[][] = [
      [210, 217, 228],
      [154, 170, 192],
      [233, 238, 243],
    ]
    const rawLs = raw.map((c) => (Math.max(...c) + Math.min(...c)) / 2 / 255)
    const rawSpan = Math.max(...rawLs) - Math.min(...rawLs)

    const lifted = liftPalette(raw).map(lightnessOf)
    const span = Math.max(...lifted) - Math.min(...lifted)
    expect(span).toBeCloseTo(rawSpan, 1)
  })

  test("compresses a palette too contrasty for the band rather than clipping it", () => {
    const lifted = liftPalette([
      [255, 255, 255],
      [0, 0, 0],
    ]).map(lightnessOf)
    expect(Math.min(...lifted)).toBeCloseTo(INK_MIN_L, 1)
    expect(Math.max(...lifted)).toBeCloseTo(INK_MAX_L, 1)
  })

  test("leaves a well-exposed palette where the cover put it", () => {
    const raw: number[][] = [
      [90, 110, 130],
      [140, 150, 160],
      [180, 190, 200],
    ]
    const before = raw.map((c) => (Math.max(...c) + Math.min(...c)) / 2 / 255)
    const after = liftPalette(raw).map(lightnessOf)
    for (let i = 0; i < raw.length; i++) expect(after[i]!).toBeCloseTo(before[i]!, 1)
  })

  test("an empty palette lifts to an empty palette", () => {
    expect(liftPalette([])).toEqual([])
  })
})
