// Album covers, reduced to a luminance grid the renderer can dither.
//
// Fetched and decoded ONCE PER TRACK in the nowplaying singleton, never per
// session — 30 SSH sessions looking at the same song share one grid. The result
// is resolution-independent (a fixed LUMA_SIZE square), so each session scales
// it down to whatever its own frame allows without re-touching the network.
//
// Everything here is defensive. This is the only place in the process that
// hands a remote byte stream to a decoder, and a session must never die because
// somebody's cover art was a 404 page or a malformed jpeg.

import { decode } from "jpeg-js"

/** Working resolution. Every terminal size downsamples from this one grid. */
export const LUMA_SIZE = 64
/** Spotify's 300px covers run ~4KB; this is pure abuse protection. */
export const MAX_ART_BYTES = 512 * 1024
export const ART_TIMEOUT_MS = 6_000
const CACHE_MAX = 4

/** Row-major luminance, 0..1. */
export type Luma = { size: number; data: Float32Array }

export function sniffJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

/**
 * Box-filter downsample to `size` square, Rec.709 luminance.
 *
 * Box filtering rather than nearest-neighbour because the output is tiny (a
 * 64-wide grid from a 300-wide cover) and point sampling at that ratio throws
 * away most of the image — album art is full of thin type and edges that alias
 * into noise.
 */
export function toLuma(rgba: Uint8Array, w: number, h: number, size: number): Luma {
  const out = new Float32Array(size * size)
  if (w <= 0 || h <= 0) return { size, data: out }

  for (let oy = 0; oy < size; oy++) {
    const y0 = Math.floor((oy * h) / size)
    const y1 = Math.max(y0 + 1, Math.floor(((oy + 1) * h) / size))
    for (let ox = 0; ox < size; ox++) {
      const x0 = Math.floor((ox * w) / size)
      const x1 = Math.max(x0 + 1, Math.floor(((ox + 1) * w) / size))

      let sum = 0
      let n = 0
      for (let y = y0; y < y1 && y < h; y++) {
        for (let x = x0; x < x1 && x < w; x++) {
          const i = (y * w + x) * 4
          const r = rgba[i] ?? 0
          const g = rgba[i + 1] ?? 0
          const b = rgba[i + 2] ?? 0
          sum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
          n++
        }
      }
      out[oy * size + ox] = n > 0 ? sum / n : 0
    }
  }
  return { size, data: out }
}

const BINS = 256
/**
 * How far to push toward a fully equalized histogram. Full equalization
 * flattens smooth gradients into banding; this keeps a little of the cover's
 * own tonal character.
 */
const EQ_MIX = 0.85

/**
 * Histogram equalization, anchored so true black stays black.
 *
 * A five-level ramp has almost no tonal range to spend, so the mapping has to
 * adapt to the image: a near-black cover (measured: median luminance 0.02)
 * renders as an empty rectangle under a linear map, and a bright one clips to
 * solid blocks. Equalization spends the five levels evenly by construction, in
 * both directions.
 *
 * The `cdfMin` term is the load-bearing part. Without it the darkest bin maps
 * to its own cumulative frequency — on a cover that is 40% black, the
 * background becomes mid-grey and the whole frame fills with dither noise,
 * destroying the negative space that makes the thing read as artwork at all.
 */
export function equalize(l: Luma): Luma {
  const n = l.data.length
  if (n === 0) return l

  const bin = (v: number): number => Math.min(BINS - 1, Math.max(0, Math.round(v * (BINS - 1))))

  const hist = new Uint32Array(BINS)
  for (let i = 0; i < n; i++) hist[bin(l.data[i] ?? 0)]!++

  const cdf = new Float32Array(BINS)
  let acc = 0
  for (let i = 0; i < BINS; i++) {
    acc += hist[i]!
    cdf[i] = acc / n
  }

  let cdfMin = 0
  for (let i = 0; i < BINS; i++) {
    if (hist[i]! > 0) {
      cdfMin = cdf[i]!
      break
    }
  }

  const denom = 1 - cdfMin
  // A flat field is entirely one bin, so cdfMin is 1 and there is nothing to
  // equalize. Dividing here would fill the grid with NaN and paint garbage.
  if (!(denom > 0.001)) return l

  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const v = l.data[i] ?? 0
    const e = Math.min(1, Math.max(0, (cdf[bin(v)]! - cdfMin) / denom))
    out[i] = EQ_MIX * e + (1 - EQ_MIX) * v
  }
  return { size: l.size, data: out }
}

/** Synchronous, and NEVER throws — a bad image yields null and a placeholder. */
export function decodeLuma(bytes: Uint8Array): Luma | null {
  if (!sniffJpeg(bytes)) return null
  try {
    const img = decode(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      tolerantDecoding: true,
      // LOAD-BEARING. jpeg-js decodes synchronously on the event loop, so a
      // decompression bomb would freeze every session at once. A 300x300 cover
      // is 0.09MP, leaving 10x headroom.
      maxResolutionInMP: 1,
      maxMemoryUsageInMB: 32,
    })
    if (img.width <= 0 || img.height <= 0) return null
    return equalize(toLuma(img.data, img.width, img.height, LUMA_SIZE))
  } catch {
    return null
  }
}

// ---- CACHE -----------------------------------------------------------------

const cache = new Map<string, Luma>()
const inFlight = new Set<string>()

export function getArt(url: string): Luma | null {
  const hit = cache.get(url)
  if (!hit) return null
  // Re-insert so the Map's insertion order stays LRU.
  cache.delete(url)
  cache.set(url, hit)
  return hit
}

export function clearArtCache(): void {
  cache.clear()
  inFlight.clear()
}

async function load(url: string): Promise<Luma | null> {
  const response = await fetch(url, { signal: AbortSignal.timeout(ART_TIMEOUT_MS) })
  if (!response.ok) return null

  // Cheapest rejection first, before a byte of body is read.
  const declared = Number(response.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > MAX_ART_BYTES) return null

  const buf = await response.arrayBuffer()
  // A chunked response carries no length header, so the real size is only
  // knowable here.
  if (buf.byteLength > MAX_ART_BYTES) return null

  return decodeLuma(new Uint8Array(buf))
}

/**
 * CALLBACK-STYLE ON PURPOSE. Returning a promise would put an await (and an
 * unhandled-rejection risk) in the poll loop, which runs in the one process
 * serving every session. `done` is always called exactly once.
 */
export function ensureArt(url: string, done: (url: string, luma: Luma | null) => void): void {
  const hit = getArt(url)
  if (hit) {
    done(url, hit)
    return
  }
  if (inFlight.has(url)) return
  inFlight.add(url)

  void load(url)
    .catch(() => null)
    .then((luma) => {
      inFlight.delete(url)
      if (luma) {
        cache.set(url, luma)
        while (cache.size > CACHE_MAX) {
          const oldest = cache.keys().next().value
          if (oldest === undefined) break
          cache.delete(oldest)
        }
      }
      done(url, luma)
    })
}
