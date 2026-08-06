// Album covers, reduced to a luminance grid the renderer can dither and a
// three-ink palette it can paint them in.
//
// Fetched and decoded ONCE PER TRACK in the nowplaying singleton, never per
// session — 30 SSH sessions looking at the same song share one grid. The result
// is resolution-independent (a fixed LUMA_SIZE square), so each session scales
// it down to whatever its own frame allows without re-touching the network.
// The palette is extracted here for the same reason: k-means is the most
// expensive thing in this file and it must run once, not once per viewer.
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

/**
 * A cover ready to draw: luminance for the glyph, an ink index per cell for the
 * colour. `palette` is empty when quantisation had nothing to work with, which
 * renders exactly as the app did before colour existed.
 */
export type Art = {
  luma: Luma
  /** Lifted hex inks, darkest first is NOT guaranteed — order follows k-means. */
  palette: string[]
  /** Row-major index into `palette`, at `luma.size` resolution. */
  ink: Uint8Array
}

export function sniffJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

/**
 * Box-filter downsample to `size` square, keeping all three channels.
 *
 * Box filtering rather than nearest-neighbour because the output is tiny (a
 * 64-wide grid from a 300-wide cover) and point sampling at that ratio throws
 * away most of the image — album art is full of thin type and edges that alias
 * into noise.
 */
export function toRgb(rgba: Uint8Array, w: number, h: number, size: number): Float32Array {
  const out = new Float32Array(size * size * 3)
  if (w <= 0 || h <= 0) return out

  for (let oy = 0; oy < size; oy++) {
    const y0 = Math.floor((oy * h) / size)
    const y1 = Math.max(y0 + 1, Math.floor(((oy + 1) * h) / size))
    for (let ox = 0; ox < size; ox++) {
      const x0 = Math.floor((ox * w) / size)
      const x1 = Math.max(x0 + 1, Math.floor(((ox + 1) * w) / size))

      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let y = y0; y < y1 && y < h; y++) {
        for (let x = x0; x < x1 && x < w; x++) {
          const i = (y * w + x) * 4
          r += rgba[i] ?? 0
          g += rgba[i + 1] ?? 0
          b += rgba[i + 2] ?? 0
          n++
        }
      }
      const o = (oy * size + ox) * 3
      out[o] = n > 0 ? r / n : 0
      out[o + 1] = n > 0 ? g / n : 0
      out[o + 2] = n > 0 ? b / n : 0
    }
  }
  return out
}

/**
 * Rec.709 luminance of the same box filter.
 *
 * Weighting the averaged channels is identical to averaging the weighted
 * pixels — luminance is linear in r/g/b — so this shares toRgb's loop instead
 * of walking the source image a second time.
 */
export function toLuma(rgba: Uint8Array, w: number, h: number, size: number): Luma {
  return lumaOf(toRgb(rgba, w, h, size), size)
}

function lumaOf(rgb: Float32Array, size: number): Luma {
  const out = new Float32Array(size * size)
  for (let i = 0; i < out.length; i++) {
    const o = i * 3
    out[i] = (0.2126 * (rgb[o] ?? 0) + 0.7152 * (rgb[o + 1] ?? 0) + 0.0722 * (rgb[o + 2] ?? 0)) / 255
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

// ---- COLOUR ----------------------------------------------------------------

/**
 * Inks per cover. Three, because the point is a screenprint of the sleeve and
 * not a photograph of it — and because run-length collapse across three flat
 * inks keeps the repaint at ~2-3 colour escapes per row instead of one per cell
 * (measured on a real 300px cover: 103 escapes at K=3 against 660 truecolour).
 */
export const INK_COUNT = 3
/** Readable band for lifted inks, as HSL lightness. */
export const INK_MIN_L = 0.3
export const INK_MAX_L = 0.92
/** Fixed, so quantisation always costs the same and always lands identically. */
const KMEANS_PASSES = 14

/**
 * k-means over the cell grid, DETERMINISTIC BY CONSTRUCTION.
 *
 * Seeds are sampled at fixed offsets through the grid rather than at random,
 * for the same reason waveform() is a pure function of the track URL: one
 * process serves every session, and a cover must not be able to render two ways
 * — a reconnect that reshuffled the inks would look like a bug.
 */
export function quantize(
  rgb: Float32Array,
  size: number,
  k: number,
): { palette: number[][]; ink: Uint8Array } {
  const n = size * size
  if (n <= 0 || k <= 0 || rgb.length < n * 3) return { palette: [], ink: new Uint8Array(0) }

  const at = (i: number): number[] => [rgb[i * 3] ?? 0, rgb[i * 3 + 1] ?? 0, rgb[i * 3 + 2] ?? 0]
  let centroids = seed(at, n, k)
  const ink = new Uint8Array(n)

  for (let pass = 0; pass < KMEANS_PASSES; pass++) {
    for (let i = 0; i < n; i++) {
      const c = at(i)
      let best = 0
      let bestDist = Infinity
      for (let j = 0; j < k; j++) {
        const centroid = centroids[j]!
        const dr = c[0]! - centroid[0]!
        const dg = c[1]! - centroid[1]!
        const db = c[2]! - centroid[2]!
        const dist = dr * dr + dg * dg + db * db
        if (dist < bestDist) {
          bestDist = dist
          best = j
        }
      }
      ink[i] = best
    }

    const sums = Array.from({ length: k }, () => [0, 0, 0, 0])
    for (let i = 0; i < n; i++) {
      const s = sums[ink[i]!]!
      const c = at(i)
      s[0]! += c[0]!
      s[1]! += c[1]!
      s[2]! += c[2]!
      s[3]! += 1
    }
    // An empty cluster keeps its previous centroid. Dividing by its zero count
    // would fill the palette with NaN, and every cell would then fail the
    // nearest-ink test and collapse onto ink 0.
    centroids = centroids.map((prev, j) => {
      const s = sums[j]!
      return s[3]! > 0 ? [s[0]! / s[3]!, s[1]! / s[3]!, s[2]! / s[3]!] : prev
    })
  }

  return lightestFirst(centroids, ink)
}

/**
 * Farthest-point seeding: start at the first cell, then repeatedly take the
 * cell furthest from everything chosen so far.
 *
 * DETERMINISTIC, which is the whole constraint here — k-means++ picks that
 * point at random, and one process serving every session cannot have a cover
 * that renders two ways. Ties break on the lower index for the same reason.
 *
 * Sampling seeds at fixed offsets through the grid is simpler and was the first
 * cut, but it hands the same colour to two clusters whenever a sleeve has large
 * flat bands — one cluster then starves and the cover quietly prints in two
 * inks instead of three.
 */
function seed(at: (i: number) => number[], n: number, k: number): number[][] {
  const chosen = [at(0)]
  const far = new Float64Array(n)
  for (let i = 0; i < n; i++) far[i] = dist2(at(i), chosen[0]!)

  while (chosen.length < k) {
    let pick = 0
    for (let i = 1; i < n; i++) if (far[i]! > far[pick]!) pick = i
    const next = at(pick)
    chosen.push(next)
    for (let i = 0; i < n; i++) far[i] = Math.min(far[i]!, dist2(at(i), next))
  }
  return chosen
}

function dist2(a: number[], b: number[]): number {
  const dr = a[0]! - b[0]!
  const dg = a[1]! - b[1]!
  const db = a[2]! - b[2]!
  return dr * dr + dg * dg + db * db
}

/**
 * Re-index a palette so the lightest ink is first.
 *
 * This IS the print order MusicPage registers the cover in, and it is how a
 * press actually runs — light inks down first, dark detail last. It is also the
 * only order whose first pass is VISIBLE: blank paper on a dark terminal is
 * dark, so leading with the darkest ink (which on most sleeves is also the
 * widest) spends the opening pass painting near-black onto near-black and the
 * entrance reads as a dead frame and then a pop.
 *
 * Sorting here rather than at the call site means the renderer never has to
 * carry a separate ordering alongside the palette and risk the two drifting.
 */
function lightestFirst(
  centroids: number[][],
  ink: Uint8Array,
): { palette: number[][]; ink: Uint8Array } {
  const light = (c: number[]): number => Math.max(...c) + Math.min(...c)
  const order = centroids.map((_, i) => i).sort((a, b) => light(centroids[b]!) - light(centroids[a]!))
  const remap = new Uint8Array(centroids.length)
  order.forEach((from, to) => {
    remap[from] = to
  })

  const out = new Uint8Array(ink.length)
  for (let i = 0; i < ink.length; i++) out[i] = remap[ink[i]!]!
  return { palette: order.map((i) => centroids[i]!), ink: out }
}

function toHsl(c: number[]): { h: number; s: number; l: number } {
  const r = (c[0] ?? 0) / 255
  const g = (c[1] ?? 0) / 255
  const b = (c[2] ?? 0) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d < 1e-6) return { h: 0, s: 0, l }

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return { h: (((h * 60) % 360) + 360) % 360, s, l }
}

function toHex({ h, s, l }: { h: number; s: number; l: number }): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const seg = Math.floor(h / 60) % 6
  const rgb =
    seg === 0
      ? [c, x, 0]
      : seg === 1
        ? [x, c, 0]
        : seg === 2
          ? [0, c, x]
          : seg === 3
            ? [0, x, c]
            : seg === 4
              ? [x, 0, c]
              : [c, 0, x]
  return `#${rgb
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, (v + m) * 255)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`
}

/**
 * Move the inks into a readable lightness band, KEEPING THEIR HUE — and moving
 * them AS LITTLE AS POSSIBLE.
 *
 * Load-bearing, and for the same reason equalize() is: a dark cover quantises
 * to near-black inks (measured: #03171c #080f12 #000f1a) which are invisible on
 * a dark terminal. Equalize fixes that for the glyph; nothing fixed it for the
 * colour.
 *
 * The remap happens in HSL. Scaling the RGB channels toward a target brightness
 * clips whichever channel is already largest and drags the hue with it —
 * verified: it turns #03171c into #21ffff, a blown-out cyan that has nothing to
 * do with the sleeve.
 *
 * TRANSLATE, DON'T STRETCH. Normalising every cover to fill the band re-grades
 * the artwork: a sleeve that is uniformly light (measured: #d2d9e4 #9aaac0
 * #e9eef3) came out with dark navy blotches it does not contain, because its
 * narrow range was spread across the whole band. So the cover's own contrast is
 * preserved and only shifted into readable territory, compressed solely when it
 * is wider than the band can hold. A palette already inside the band comes out
 * untouched.
 */
export function liftPalette(palette: number[][]): string[] {
  if (palette.length === 0) return []

  const hsl = palette.map(toHsl)
  const ls = hsl.map((c) => c.l)
  const lo = Math.min(...ls)
  const hi = Math.max(...ls)
  const band = INK_MAX_L - INK_MIN_L
  const span = hi - lo

  const scale = span > band ? band / span : 1
  // The nearest resting place for the scaled range that lies inside the band —
  // which is `lo` itself whenever the cover was already exposed for a dark
  // terminal.
  const base = Math.min(Math.max(lo * scale, INK_MIN_L), INK_MAX_L - span * scale)

  return hsl.map((c) => toHex({ h: c.h, s: c.s, l: base + (c.l - lo) * scale }))
}

/** Synchronous, and NEVER throws — a bad image yields null and a placeholder. */
export function decodeArt(bytes: Uint8Array): Art | null {
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

    const rgb = toRgb(img.data, img.width, img.height, LUMA_SIZE)
    const { palette, ink } = quantize(rgb, LUMA_SIZE, INK_COUNT)
    return { luma: equalize(lumaOf(rgb, LUMA_SIZE)), palette: liftPalette(palette), ink }
  } catch {
    return null
  }
}

/** The luminance half of decodeArt, for callers that only draw glyphs. */
export function decodeLuma(bytes: Uint8Array): Luma | null {
  return decodeArt(bytes)?.luma ?? null
}

// ---- CACHE -----------------------------------------------------------------

const cache = new Map<string, Art>()
const inFlight = new Set<string>()

export function getArt(url: string): Art | null {
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

async function load(url: string): Promise<Art | null> {
  const response = await fetch(url, { signal: AbortSignal.timeout(ART_TIMEOUT_MS) })
  if (!response.ok) return null

  // Cheapest rejection first, before a byte of body is read.
  const declared = Number(response.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > MAX_ART_BYTES) return null

  const buf = await response.arrayBuffer()
  // A chunked response carries no length header, so the real size is only
  // knowable here.
  if (buf.byteLength > MAX_ART_BYTES) return null

  return decodeArt(new Uint8Array(buf))
}

/**
 * CALLBACK-STYLE ON PURPOSE. Returning a promise would put an await (and an
 * unhandled-rejection risk) in the poll loop, which runs in the one process
 * serving every session. `done` is always called exactly once.
 */
export function ensureArt(url: string, done: (url: string, art: Art | null) => void): void {
  const hit = getArt(url)
  if (hit) {
    done(url, hit)
    return
  }
  if (inFlight.has(url)) return
  inFlight.add(url)

  void load(url)
    .catch(() => null)
    .then((art) => {
      inFlight.delete(url)
      if (art) {
        cache.set(url, art)
        while (cache.size > CACHE_MAX) {
          const oldest = cache.keys().next().value
          if (oldest === undefined) break
          cache.delete(oldest)
        }
      }
      done(url, art)
    })
}
