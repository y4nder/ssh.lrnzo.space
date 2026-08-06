// Pure presentation for the now-playing readout: no React, no I/O, no theme.
// Everything here is a string/number builder so the awkward parts — the ticker
// width budget, the marquee window, the halftone ramp — can be tested directly
// instead of through a rendered frame.

import type { Art, Luma } from "../albumArt"

/** Coverage ramp, dark to light. Five levels is all a brutalist palette wants. */
export const RAMP = " ░▒▓█"

/**
 * 4x4 ordered dither. A five-level ramp cannot resolve a photograph on its own;
 * the threshold matrix trades spatial resolution for apparent tone, which is
 * the right trade here because the art is already downsampled far past detail.
 * Ordered rather than error-diffused so the output is stable — a Floyd-Steinberg
 * grid would shimmer as the frame resizes.
 */
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

/** mm:ss. Nothing on Spotify needs an hours field. */
export function timecode(ms: number): string {
  const total = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

/** Always exactly `len` chars, so the row never reflows as the track advances. */
export function meterBar(ratio: number, len: number): string {
  if (len <= 0) return ""
  const safe = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0
  const filled = Math.round(safe * len)
  return "█".repeat(filled) + "░".repeat(len - filled)
}

// ---- WAVEFORM --------------------------------------------------------------

/** Eighth-block ramp, bottom-anchored. */
export const WAVE_GLYPHS = "▁▂▃▄▅▆▇█"

/**
 * FNV-1a. Any stable string→int would do; what matters is that it is a PURE
 * function of the track, so every session renders the same song identically
 * and a reconnect doesn't reshuffle the strip.
 */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32 — small, seedable, and good enough for decoration. */
function rng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 6), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/**
 * A track's signature strip — the Spotify-Code look, in eighth blocks.
 *
 * Deterministic from `seed` (the track URL) rather than animated: this is not a
 * real-time visualiser and pretending otherwise would be a lie about data we do
 * not have. Spotify deprecated the audio-analysis endpoint for new apps, so
 * there IS no spectrum to draw. What it does honestly is give every song its
 * own constant shape. Progress is carried by colour, not motion — see the split
 * in NowTicker/MusicPage.
 */
export function waveform(seed: string, cells: number): string {
  if (cells <= 0) return ""
  const next = rng(hashSeed(seed))
  const levels = WAVE_GLYPHS.length

  let out = ""
  let prev = -1
  for (let i = 0; i < cells; i++) {
    let h = Math.floor(next() * levels)
    // Equal neighbours read as a plateau rather than a code; step off by a
    // non-zero amount so the strip stays jagged.
    if (h === prev) h = (h + 1 + Math.floor(next() * (levels - 1))) % levels
    prev = h
    out += WAVE_GLYPHS[h]
  }
  return out
}

/** How many of `cells` bars fall before the playhead. */
export function wavePlayed(ratio: number, cells: number): number {
  if (!Number.isFinite(ratio) || cells <= 0) return 0
  return Math.max(0, Math.min(cells, Math.round(ratio * cells)))
}

// ---- ART -------------------------------------------------------------------

/**
 * Box-average the luminance grid down to the cell grid, then dither.
 *
 * Returns exactly `rows` strings of exactly `cols` chars — including for a null
 * grid, which yields the placeholder. A cover that failed to decode must still
 * occupy its slot, or the page reflows around a missing image.
 */
export function artLines(luma: Luma | null, cols: number, rows: number): string[] {
  if (cols <= 0 || rows <= 0) return []
  if (!luma || luma.size <= 0) return placeholderLines(cols, rows)

  const { size, data } = luma
  const out: string[] = []
  for (let y = 0; y < rows; y++) {
    const y0 = Math.floor((y * size) / rows)
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * size) / rows))
    let line = ""
    for (let x = 0; x < cols; x++) {
      const x0 = Math.floor((x * size) / cols)
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * size) / cols))

      let sum = 0
      let n = 0
      for (let sy = y0; sy < y1 && sy < size; sy++) {
        for (let sx = x0; sx < x1 && sx < size; sx++) {
          sum += data[sy * size + sx] ?? 0
          n++
        }
      }
      const v = n > 0 ? sum / n : 0
      const t = (BAYER4[y & 3]![x & 3]! + 0.5) / 16
      line += RAMP[Math.min(4, Math.max(0, Math.floor(v * 4 + t)))]
    }
    out.push(line)
  }
  return out
}

/** A run of cells sharing one ink. `null` means "whatever the caller paints in". */
export type Span = { text: string; color: string | null; ink: number | null }

/**
 * The cover as coloured runs: the glyphs artLines already produces, cut into
 * spans wherever the ink changes.
 *
 * Runs rather than per-cell colour is the whole reason this is affordable. A
 * sleeve is mostly large flat regions, so three inks collapse to ~2-3 spans per
 * row — measured on a real 300px cover, 103 colour escapes per repaint against
 * 660 for per-cell truecolour, down every connected SSH session.
 *
 * A cover with no palette (quantisation gave up, or the art never decoded)
 * yields one uncoloured span per row, which paints exactly as this page did
 * before it had colour.
 */
export function artSpans(art: Art | null, cols: number, rows: number): Span[][] {
  const glyphs = artLines(art?.luma ?? null, cols, rows)
  if (!art || art.palette.length === 0 || art.luma.size <= 0) {
    return glyphs.map((text) => [{ text, color: null, ink: null }])
  }

  // Driven by the glyph rows, so the degenerate sizes artLines already refuses
  // to draw stay refused here rather than becoming empty rows.
  const out: Span[][] = []
  for (let y = 0; y < glyphs.length; y++) {
    const line = glyphs[y]!
    const row: Span[] = []
    for (let x = 0; x < cols; x++) {
      const ink = dominantInk(art, x, y, cols, rows)
      const color = art.palette[ink] ?? null
      const last = row[row.length - 1]
      if (last && last.ink === ink) last.text += line[x] ?? ""
      else row.push({ text: line[x] ?? "", color, ink })
    }
    out.push(row)
  }
  return out
}

/**
 * The ink a cell is MOSTLY made of.
 *
 * A plurality vote, not an average: averaging two ink indices lands on a third
 * ink that neither half of the cell is anywhere near, so an edge between two
 * colours would fringe with an unrelated one.
 */
function dominantInk(art: Art, x: number, y: number, cols: number, rows: number): number {
  const { size } = art.luma
  const y0 = Math.floor((y * size) / rows)
  const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * size) / rows))
  const x0 = Math.floor((x * size) / cols)
  const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * size) / cols))

  const votes = new Uint32Array(art.palette.length)
  for (let sy = y0; sy < y1 && sy < size; sy++) {
    for (let sx = x0; sx < x1 && sx < size; sx++) {
      const ink = art.ink[sy * size + sx] ?? 0
      if (ink < votes.length) votes[ink]!++
    }
  }

  let best = 0
  for (let i = 1; i < votes.length; i++) if (votes[i]! > votes[best]!) best = i
  return best
}

/**
 * The cover part-printed: the first `passes` inks laid down, the rest still
 * blank paper.
 *
 * Blanking replaces a span's glyphs with the SAME NUMBER of spaces rather than
 * dropping the span. The card is pre-sized to the cover — a pass that returned
 * a narrower row would reflow the whole thing mid-animation, which is the one
 * thing an entrance must never do.
 *
 * Inks are laid down in palette order, which quantize() sorts widest-first, so
 * the background field goes down before the detail that sits on it. A span with
 * no ink (a placeholder, or a cover whose palette never extracted) has nothing
 * to register and prints immediately.
 */
export function printedSpans(rows: Span[][], passes: number): Span[][] {
  return rows.map((row) =>
    row.map((span) =>
      span.ink === null || span.ink < passes
        ? span
        : // Colour goes too: unprinted paper carries no ink, and keeping one
          // would spend a colour escape on cells that draw nothing.
          { ...span, text: " ".repeat(span.text.length), color: null },
    ),
  )
}

/** Same footprint as real art, so a missing cover costs no layout shift. */
export function placeholderLines(cols: number, rows: number): string[] {
  if (cols <= 0 || rows <= 0) return []
  const out: string[] = []
  const caption = "NO COVER"
  const mid = Math.floor(rows / 2)
  for (let y = 0; y < rows; y++) {
    if (y === mid && cols >= caption.length) {
      const pad = Math.floor((cols - caption.length) / 2)
      out.push("░".repeat(pad) + caption + "░".repeat(cols - caption.length - pad))
    } else {
      out.push("░".repeat(cols))
    }
  }
  return out
}

// ---- MARQUEE ---------------------------------------------------------------

export const MARQUEE_GAP = "   ·   "
/** Ticks the text sits still before scrolling, so it is readable on arrival. */
export const MARQUEE_HOLD = 8

/**
 * A centred title that only scrolls when it has to.
 *
 * Centring and marqueeing are the same job at different lengths: below the
 * width the text should sit still and centred, above it there is nothing to
 * centre and it has to move. Always exactly `width` chars either way.
 */
export function titleWindow(text: string, width: number, tick: number): string {
  if (width <= 0) return ""
  if (text.length > width) return marqueeWindow(text, width, tick)
  const pad = Math.floor((width - text.length) / 2)
  return " ".repeat(pad) + text + " ".repeat(width - text.length - pad)
}

/**
 * A `width`-wide window onto scrolling text. ALWAYS returns exactly `width`
 * chars — a variable-width return would shove the meter sideways every tick.
 */
export function marqueeWindow(
  text: string,
  width: number,
  tick: number,
  gap = MARQUEE_GAP,
  hold = MARQUEE_HOLD,
): string {
  if (width <= 0) return ""
  if (text.length <= width) return text.padEnd(width)

  const cycle = text + gap
  const offset = tick <= hold ? 0 : (tick - hold) % cycle.length
  // Doubling makes the wrap-around a plain slice instead of two.
  return (cycle + cycle).slice(offset, offset + width)
}

// ---- TICKER ----------------------------------------------------------------

const WAVE_WIDTH = 12
/** Below this the wave strip costs more room than it tells you. */
const WAVE_MIN_FRAME = 68
const MARQUEE_MIN = 8
const MARQUEE_COMFORTABLE = 16
export const TICKER_HINT_KEY = "m"
export const TICKER_HINT_LABEL = " music"
const HINT_WIDTH = 2 + TICKER_HINT_KEY.length + TICKER_HINT_LABEL.length

export type TickerParts = {
  /** "NOW ▸ " / "LAST ▸ ", already padded. */
  left: string
  marqueeWidth: number
  /** 0 when the wave strip is dropped. */
  waveWidth: number
  /** "" when the timecode is dropped. */
  timeText: string
  showHint: boolean
  /** Exact rendered width of everything right of the marquee. */
  rightWidth: number
}

/**
 * Budget the ticker row.
 *
 * Guarantees `left.length + marqueeWidth + rightWidth === width` at every width
 * the app can produce (frameW is 60..84), dropping optional pieces in a fixed
 * order — wave, then timecode, then the hint — so a narrow frame degrades
 * predictably instead of wrapping.
 */
export function tickerParts(width: number, playing: boolean, timeText: string): TickerParts {
  const left = playing ? "NOW ▸ " : "LAST ▸ "
  let waveWidth = playing && width >= WAVE_MIN_FRAME ? WAVE_WIDTH : 0
  let time = timeText
  let showHint = true

  const rightWidth = (): number =>
    (waveWidth > 0 ? 2 + waveWidth : 0) + (time ? 2 + time.length : 0) + (showHint ? HINT_WIDTH : 0)
  const marquee = (): number => width - left.length - rightWidth()

  if (marquee() < MARQUEE_COMFORTABLE && waveWidth > 0) waveWidth = 0
  if (marquee() < MARQUEE_COMFORTABLE && time) time = ""
  if (marquee() < MARQUEE_MIN && showHint) showHint = false

  return {
    left,
    marqueeWidth: Math.max(0, marquee()),
    waveWidth,
    timeText: time,
    showHint,
    rightWidth: rightWidth(),
  }
}

// ---- MUSIC PAGE LAYOUT -----------------------------------------------------

/** header + heavy rule + rule + status bar, matching ResumePage/StatsPage. */
const CHROME_ROWS = 4
const ART_MAX_ROWS = 16
const ART_MIN_ROWS = 6
/** wave · title · artist — the rows the card is not a card without. */
const CARD_CORE = 3
/** The two blank separator rows. */
const CARD_SPACERS = 2

export type MusicLayout = {
  artCols: number
  artRows: number
  /**
   * Rows reserved for the cover/QR slot — the TALLER of the two whenever the
   * toggle is offered, so flipping between them never reflows the card.
   */
  slotRows: number
  /** Cover, QR and the fused wave strip are all centred in this width. */
  cardWidth: number
  /** Whether this frame has room to offer the QR toggle at all. */
  qrAvailable: boolean
  /** Everything below the slot. `slotRows + chromeRows <= height - 4` always. */
  chromeRows: number
  showSpacers: boolean
  showAlbum: boolean
  showTime: boolean
}

/**
 * `artCols = artRows * 2` corrects the terminal's ~1:2 cell aspect, so a square
 * cover renders square rather than as a letterbox. Rows step by two to keep
 * cols even.
 */
function artSize(maxRows: number, maxCols: number): { cols: number; rows: number } {
  let rows = Math.min(ART_MAX_ROWS, maxRows)
  rows = Math.max(ART_MIN_ROWS, rows - (rows % 2))
  let cols = rows * 2
  while (rows > ART_MIN_ROWS && cols > maxCols) {
    rows -= 2
    cols = rows * 2
  }
  return { cols, rows }
}

/**
 * Size the `m` page's centred card.
 *
 * ONE composition, not two: the cover and the QR occupy the same slot and are
 * swapped by a key, so there is no side-by-side case to balance. The slot is
 * sized to the taller of the pair whenever the toggle is on offer — reserving
 * the space up front is what stops the card jumping when you press `c`.
 *
 * The QR is dropped (not shrunk — a QR that loses modules stops scanning) on
 * any frame that cannot seat it, leaving the cover at full size.
 */
export function musicLayout(
  width: number,
  height: number,
  qr: { width: number; height: number } | null,
): MusicLayout {
  const body = Math.max(0, height - CHROME_ROWS)

  // The cover has a floor (below ~6 rows it is mush, not artwork), so on a
  // short frame the CARD gives up rows instead — breathing room first, then
  // the timecode, then the album. Title and artist never go: a now-playing
  // readout that cannot say what is playing has no reason to exist.
  let showSpacers = true
  let showAlbum = true
  let showTime = true
  let chromeRows = CARD_CORE + CARD_SPACERS + 2

  if (body - chromeRows < ART_MIN_ROWS) {
    showSpacers = false
    chromeRows -= CARD_SPACERS
  }
  if (body - chromeRows < ART_MIN_ROWS) {
    showTime = false
    chromeRows -= 1
  }
  if (body - chromeRows < ART_MIN_ROWS) {
    showAlbum = false
    chromeRows -= 1
  }

  const art = artSize(body - chromeRows, width)
  const qrAvailable =
    qr !== null && qr.width <= width && body >= Math.max(art.rows, qr.height) + chromeRows

  return {
    artCols: art.cols,
    artRows: art.rows,
    slotRows: qrAvailable && qr ? Math.max(art.rows, qr.height) : art.rows,
    cardWidth: qrAvailable && qr ? Math.max(art.cols, qr.width) : art.cols,
    qrAvailable,
    chromeRows,
    showSpacers,
    showAlbum,
    showTime,
  }
}
