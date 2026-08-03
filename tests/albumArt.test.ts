import { describe, expect, test } from "bun:test"
import { encode } from "jpeg-js"
import { decodeLuma, equalize, LUMA_SIZE, sniffJpeg, toLuma, type Luma } from "../src/albumArt"

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
