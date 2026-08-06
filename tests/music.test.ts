import { describe, expect, test } from "bun:test"
import type { Art, Luma } from "../src/albumArt"
import {
  artLines,
  artSpans,
  printedSpans,
  marqueeWindow,
  meterBar,
  musicLayout,
  placeholderLines,
  RAMP,
  tickerParts,
  timecode,
  titleWindow,
  WAVE_GLYPHS,
  wavePlayed,
  waveform,
} from "../src/app/music"

const WIDTHS = Array.from({ length: 25 }, (_, i) => 60 + i) // frameW is 60..84
const HEIGHTS = Array.from({ length: 19 }, (_, i) => 14 + i) // frameH is 14..32

function flat(size: number, value: number): Luma {
  return { size, data: new Float32Array(size * size).fill(value) }
}

/** A cover whose ink at each grid cell is chosen by `at`. */
function art(luma: Luma, palette: string[], at: (x: number, y: number) => number = () => 0): Art {
  const ink = new Uint8Array(luma.size * luma.size)
  for (let y = 0; y < luma.size; y++) {
    for (let x = 0; x < luma.size; x++) ink[y * luma.size + x] = at(x, y)
  }
  return { luma, palette, ink }
}

function rowText(spans: { text: string }[]): string {
  return spans.map((s) => s.text).join("")
}

describe("timecode", () => {
  test("formats mm:ss", () => {
    expect(timecode(0)).toBe("0:00")
    expect(timecode(59_999)).toBe("0:59")
    expect(timecode(203_200)).toBe("3:23")
    expect(timecode(600_000)).toBe("10:00")
  })

  test("clamps nonsense to zero rather than printing NaN", () => {
    expect(timecode(-5_000)).toBe("0:00")
    expect(timecode(Number.NaN)).toBe("0:00")
  })
})

describe("meterBar", () => {
  test("fills proportionally at a fixed width", () => {
    expect(meterBar(0, 10)).toBe("░░░░░░░░░░")
    expect(meterBar(0.5, 10)).toBe("█████░░░░░")
    expect(meterBar(1, 10)).toBe("██████████")
  })

  test("never returns anything but exactly len chars", () => {
    for (const ratio of [-1, 0, 0.37, 1, 2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(meterBar(ratio, 12)).toHaveLength(12)
    }
    expect(meterBar(0.5, 0)).toBe("")
  })

  test("a NaN ratio renders empty, not garbage", () => {
    expect(meterBar(Number.NaN, 6)).toBe("░░░░░░")
  })
})

describe("marqueeWindow", () => {
  test("pads short text and ignores the tick entirely", () => {
    const a = marqueeWindow("short", 20, 0)
    expect(a).toBe("short".padEnd(20))
    expect(marqueeWindow("short", 20, 999)).toBe(a)
  })

  test("always returns exactly width chars while scrolling", () => {
    const text = "They Perched on Their Stilts, Pointing and Daring Me to Break Custom"
    for (let tick = 0; tick < 200; tick++) {
      expect(marqueeWindow(text, 30, tick)).toHaveLength(30)
    }
  })

  test("holds still before it starts moving", () => {
    const text = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghij"
    const first = marqueeWindow(text, 20, 0)
    expect(first).toBe(text.slice(0, 20))
    for (let tick = 1; tick <= 8; tick++) expect(marqueeWindow(text, 20, tick)).toBe(first)
    expect(marqueeWindow(text, 20, 9)).not.toBe(first)
  })

  test("is periodic over the cycle length", () => {
    const text = "abcdefghijklmnopqrstuvwxyz0123456789"
    const gap = " · "
    const cycle = text.length + gap.length
    for (let tick = 9; tick < 20; tick++) {
      expect(marqueeWindow(text, 12, tick, gap)).toBe(marqueeWindow(text, 12, tick + cycle, gap))
    }
  })

  test("separates the tail from the head with the gap", () => {
    const text = "ABCDEFGHIJKLMNOP"
    const joined = Array.from({ length: 40 }, (_, t) => marqueeWindow(text, 10, t, " · ")).join("|")
    expect(joined).toContain("·")
  })

  test("degenerate widths do not throw", () => {
    expect(marqueeWindow("anything", 0, 3)).toBe("")
    expect(marqueeWindow("", 5, 3)).toBe("     ")
  })
})

describe("tickerParts", () => {
  test("the width budget balances exactly at every frame width", () => {
    for (const width of WIDTHS) {
      for (const playing of [true, false]) {
        const p = tickerParts(width, playing, playing ? "1:42/2:51" : "")
        expect(p.left.length + p.marqueeWidth + p.rightWidth).toBe(width)
        expect(p.marqueeWidth).toBeGreaterThanOrEqual(8)
      }
    }
  })

  test("drops the wave strip first, on narrow frames only", () => {
    expect(tickerParts(84, true, "1:42/2:51").waveWidth).toBeGreaterThan(0)
    expect(tickerParts(60, true, "1:42/2:51").waveWidth).toBe(0)
  })

  test("never shows a wave strip when idle", () => {
    for (const width of WIDTHS) expect(tickerParts(width, false, "").waveWidth).toBe(0)
  })

  test("keeps the affordance hint at every real frame width", () => {
    for (const width of WIDTHS) expect(tickerParts(width, true, "1:42/2:51").showHint).toBe(true)
  })

  test("sheds the timecode before the hint when squeezed", () => {
    // A pathological width past anything the app produces: the marquee floor
    // must still win over the optional pieces.
    const p = tickerParts(24, true, "1:42/2:51")
    expect(p.waveWidth).toBe(0)
    expect(p.timeText).toBe("")
    expect(p.left.length + p.marqueeWidth + p.rightWidth).toBe(24)
  })

  test("labels the idle state differently", () => {
    expect(tickerParts(84, true, "0:01/3:00").left.trimEnd()).toBe("NOW ▸")
    expect(tickerParts(84, false, "").left.trimEnd()).toBe("LAST ▸")
  })
})

describe("artLines", () => {
  test("renders exactly rows x cols", () => {
    const lines = artLines(flat(64, 0.5), 32, 16)
    expect(lines).toHaveLength(16)
    for (const l of lines) expect(l).toHaveLength(32)
  })

  test("maps the extremes to the ends of the ramp", () => {
    expect(artLines(flat(16, 0), 8, 4).every((l) => l === " ".repeat(8))).toBe(true)
    expect(artLines(flat(16, 1), 8, 4).every((l) => l === "█".repeat(8))).toBe(true)
  })

  test("dithers a tone between ramp levels into a mix of glyphs", () => {
    // 0.6 sits at 2.4 of 4 steps, so the Bayer threshold must straddle it.
    // Without dithering a 5-level ramp would flatten it to one solid block.
    const glyphs = new Set(artLines(flat(32, 0.6), 16, 8).join("").split(""))
    expect(glyphs.size).toBeGreaterThan(1)
    for (const g of glyphs) {
      const i = RAMP.indexOf(g)
      expect(i).toBeGreaterThan(0)
      expect(i).toBeLessThan(4)
    }
  })

  test("a tone sitting exactly on a ramp level renders uniformly", () => {
    // 0.5 is exactly 2.0 of 4 steps: there is nothing between levels to
    // dither, and adding noise there would be wrong, not prettier.
    expect(new Set(artLines(flat(32, 0.5), 16, 8).join("").split("")).size).toBe(1)
  })

  test("box-averages rather than point-samples when scaling down", () => {
    // Left half black, right half white in the source grid.
    const size = 16
    const data = new Float32Array(size * size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) data[y * size + x] = x < size / 2 ? 0 : 1
    }
    const lines = artLines({ size, data }, 4, 2)
    for (const l of lines) {
      expect(l.slice(0, 2)).toBe("  ")
      expect(l.slice(2)).toBe("██")
    }
  })

  test("a null grid yields the placeholder at the same footprint", () => {
    const lines = artLines(null, 20, 6)
    expect(lines).toHaveLength(6)
    for (const l of lines) expect(l).toHaveLength(20)
    expect(lines.join("")).toContain("NO COVER")
  })

  test("degenerate sizes return empty rather than throwing", () => {
    expect(artLines(flat(8, 0.5), 0, 4)).toEqual([])
    expect(artLines(flat(8, 0.5), 4, 0)).toEqual([])
  })
})

describe("artSpans", () => {
  const INKS = ["#aa0000", "#0000aa"]

  test("every row still spans exactly cols, so the card cannot reflow", () => {
    const spans = artSpans(art(flat(64, 0.5), INKS), 32, 16)
    expect(spans).toHaveLength(16)
    for (const row of spans) expect(rowText(row)).toHaveLength(32)
  })

  test("draws the same glyphs artLines does — colour changes paint, not tone", () => {
    const luma = flat(32, 0.6)
    const spans = artSpans(art(luma, INKS), 16, 8)
    expect(spans.map(rowText)).toEqual(artLines(luma, 16, 8))
  })

  test("coalesces a single-ink cover into one span per row", () => {
    // The whole point of spans over per-cell colour: a flat region costs one
    // escape, not one per column.
    const spans = artSpans(art(flat(32, 0.5), INKS), 16, 8)
    for (const row of spans) {
      expect(row).toHaveLength(1)
      expect(row[0]!.color).toBe("#aa0000")
    }
  })

  test("splits a row where the ink changes", () => {
    const size = 16
    const spans = artSpans(art(flat(size, 0.5), INKS, (x) => (x < size / 2 ? 0 : 1)), 8, 4)
    for (const row of spans) {
      expect(row).toHaveLength(2)
      expect(row[0]).toEqual({ text: "▒▒▒▒", color: "#aa0000", ink: 0 })
      expect(row[1]).toEqual({ text: "▒▒▒▒", color: "#0000aa", ink: 1 })
    }
  })

  test("takes the ink the cell is mostly made of, not the one it starts with", () => {
    // Downsampling 16 grid cells into 4 columns: the first output column is
    // three parts ink 0 to one part ink 1 and must not flip on the minority.
    const size = 16
    const spans = artSpans(art(flat(size, 0.5), INKS, (x) => (x % 4 === 3 ? 1 : 0)), 4, 2)
    for (const row of spans) expect(row).toHaveLength(1)
  })

  test("a cover with no palette paints in one uncoloured span per row", () => {
    // Quantisation gave up; the page falls back to the accent it used before
    // colour existed.
    const spans = artSpans(art(flat(32, 0.5), []), 16, 8)
    for (const row of spans) {
      expect(row).toHaveLength(1)
      expect(row[0]!.color).toBeNull()
    }
  })

  test("a null cover yields the placeholder, uncoloured, at the same footprint", () => {
    const spans = artSpans(null, 20, 6)
    expect(spans).toHaveLength(6)
    for (const row of spans) {
      expect(rowText(row)).toHaveLength(20)
      expect(row.every((s) => s.color === null)).toBe(true)
    }
    expect(spans.map(rowText).join("")).toContain("NO COVER")
  })

  test("degenerate sizes return empty rather than throwing", () => {
    expect(artSpans(art(flat(8, 0.5), INKS), 0, 4)).toEqual([])
    expect(artSpans(art(flat(8, 0.5), INKS), 4, 0)).toEqual([])
  })
})

describe("printedSpans", () => {
  const INKS = ["#aa0000", "#0000aa", "#00aa00"]
  const size = 24
  // Ink 0 across most of the row, ink 1 then ink 2 in narrowing bands — the
  // coverage order quantize() guarantees.
  const cover = () =>
    art(flat(size, 0.5), INKS, (x) => (x < 12 ? 0 : x < 18 ? 1 : 2))

  test("prints nothing on pass zero, and prints it at full width", () => {
    // The card is pre-sized to the cover. A pass that narrowed a row would
    // reflow the whole thing mid-animation.
    const rows = printedSpans(artSpans(cover(), 12, 4), 0)
    for (const row of rows) {
      expect(rowText(row)).toHaveLength(12)
      expect(rowText(row).trim()).toBe("")
    }
  })

  test("lays each ink down in turn", () => {
    const spans = artSpans(cover(), 12, 4)
    const inked = (passes: number) =>
      new Set(
        printedSpans(spans, passes)
          .flat()
          .filter((s) => s.color !== null)
          .map((s) => s.color),
      )
    expect(inked(1)).toEqual(new Set([INKS[0]!]))
    expect(inked(2)).toEqual(new Set([INKS[0]!, INKS[1]!]))
    expect(inked(3)).toEqual(new Set(INKS))
  })

  test("a finished print is the cover itself", () => {
    const spans = artSpans(cover(), 12, 4)
    expect(printedSpans(spans, INKS.length)).toEqual(spans)
  })

  test("an uninked row prints immediately — a placeholder has nothing to register", () => {
    const rows = printedSpans(artSpans(art(flat(16, 0.5), []), 8, 2), 0)
    expect(rows.map(rowText).join("")).toBe(artSpans(art(flat(16, 0.5), []), 8, 2).map(rowText).join(""))
  })
})

describe("placeholderLines", () => {
  test("keeps exact dimensions even when too narrow for the caption", () => {
    const lines = placeholderLines(4, 3)
    expect(lines).toHaveLength(3)
    for (const l of lines) expect(l).toHaveLength(4)
    expect(lines.join("")).not.toContain("NO COVER")
  })
})

describe("musicLayout", () => {
  const QR = { width: 33, height: 17 }
  // wave · title · artist — never dropped
  const CARD_CORE = 3
  // header · heavy rule · rule · status bar
  const CHROME_ROWS = 4

  test("the card fits every frame the app can produce", () => {
    for (const width of WIDTHS) {
      for (const height of HEIGHTS) {
        for (const qr of [QR, null]) {
          const l = musicLayout(width, height, qr)
          expect(l.artCols).toBe(l.artRows * 2)
          expect(l.artRows % 2).toBe(0)
          expect(l.artRows).toBeGreaterThanOrEqual(6)
          expect(l.cardWidth).toBeLessThanOrEqual(width)
          // The card must never claim more rows than the body has.
          expect(l.slotRows + l.chromeRows).toBeLessThanOrEqual(height - CHROME_ROWS)
          // Title and artist survive every degradation.
          expect(l.chromeRows).toBeGreaterThanOrEqual(CARD_CORE)
        }
      }
    }
  })

  test("the slot reserves the taller of cover and QR so `c` cannot reflow it", () => {
    for (const width of WIDTHS) {
      for (const height of HEIGHTS) {
        const l = musicLayout(width, height, QR)
        if (!l.qrAvailable) continue
        // Both must fit the reserved slot without resizing it.
        expect(l.slotRows).toBeGreaterThanOrEqual(l.artRows)
        expect(l.slotRows).toBeGreaterThanOrEqual(QR.height)
        expect(l.cardWidth).toBeGreaterThanOrEqual(l.artCols)
        expect(l.cardWidth).toBeGreaterThanOrEqual(QR.width)
      }
    }
  })

  test("offers the QR toggle only where the symbol genuinely fits", () => {
    expect(musicLayout(84, 32, QR).qrAvailable).toBe(true)
    // Too short: the slot plus the card's chrome runs off the body.
    expect(musicLayout(84, 26, QR).qrAvailable).toBe(false)
    // Too narrow for the symbol at its real width.
    expect(musicLayout(60, 32, { width: 61, height: 17 }).qrAvailable).toBe(false)
    expect(musicLayout(84, 32, null).qrAvailable).toBe(false)
  })

  test("responds to the QR's real dimensions rather than a hardcoded size", () => {
    // A track url with a ?si= param encodes to a bigger symbol. A QR that
    // loses modules stops scanning, so it is dropped, never shrunk.
    expect(musicLayout(84, 32, { width: 37, height: 19 }).qrAvailable).toBe(true)
    expect(musicLayout(84, 32, { width: 37, height: 19 }).slotRows).toBe(19)
    expect(musicLayout(84, 32, { width: 45, height: 25 }).qrAvailable).toBe(false)
  })

  test("dropping the QR leaves the cover at full size", () => {
    const withQr = musicLayout(84, 32, QR)
    const without = musicLayout(84, 32, null)
    expect(without.artCols).toBe(withQr.artCols)
    expect(without.cardWidth).toBe(without.artCols)
    expect(without.slotRows).toBe(without.artRows)
  })

  test("shrinks the cover on the smallest frames", () => {
    expect(musicLayout(84, 32, null).artCols).toBe(32)
    expect(musicLayout(60, 14, null).artRows).toBe(6)
  })

  test("sheds card chrome rather than crushing the cover on short frames", () => {
    const roomy = musicLayout(84, 32, null)
    expect(roomy.showSpacers).toBe(true)
    expect(roomy.showAlbum).toBe(true)
    expect(roomy.showTime).toBe(true)

    // The smallest frame the app renders at all: the cover holds its floor and
    // the card gives up breathing room and the timecode instead.
    const tiny = musicLayout(60, 14, null)
    expect(tiny.artRows).toBe(6)
    expect(tiny.showSpacers).toBe(false)
    expect(tiny.showTime).toBe(false)
  })
})

describe("waveform", () => {
  const URL_A = "https://open.spotify.com/track/2VFxYVlUzDQQrf9ZLDXUIn"
  const URL_B = "https://open.spotify.com/track/7c4vXxglI2zKzs99geaEuh"

  test("is exactly `cells` glyphs, all from the ramp", () => {
    for (const cells of [1, 12, 32, 33, 84]) {
      const w = waveform(URL_A, cells)
      expect(w).toHaveLength(cells)
      for (const g of w) expect(WAVE_GLYPHS).toContain(g)
    }
    expect(waveform(URL_A, 0)).toBe("")
  })

  test("is deterministic — every session draws the same song identically", () => {
    expect(waveform(URL_A, 32)).toBe(waveform(URL_A, 32))
  })

  test("gives different tracks different signatures", () => {
    expect(waveform(URL_A, 32)).not.toBe(waveform(URL_B, 32))
  })

  test("never repeats a bar height back to back", () => {
    // Equal neighbours read as a plateau rather than a code.
    for (const seed of [URL_A, URL_B, "x", "another/track/id"]) {
      const w = waveform(seed, 64)
      for (let i = 1; i < w.length; i++) expect(w[i]).not.toBe(w[i - 1])
    }
  })

  test("uses the full height range rather than hugging the middle", () => {
    const levels = new Set(Array.from(waveform(URL_A, 84), (g) => WAVE_GLYPHS.indexOf(g)))
    expect(levels.size).toBeGreaterThanOrEqual(6)
    expect(Math.max(...levels)).toBeGreaterThanOrEqual(6)
    expect(Math.min(...levels)).toBeLessThanOrEqual(1)
  })
})

describe("wavePlayed", () => {
  test("maps progress onto a bar boundary", () => {
    expect(wavePlayed(0, 32)).toBe(0)
    expect(wavePlayed(0.5, 32)).toBe(16)
    expect(wavePlayed(1, 32)).toBe(32)
  })

  test("clamps rather than overrunning the strip", () => {
    for (const ratio of [-1, 2, Number.NaN, Number.POSITIVE_INFINITY]) {
      const cut = wavePlayed(ratio, 32)
      expect(cut).toBeGreaterThanOrEqual(0)
      expect(cut).toBeLessThanOrEqual(32)
    }
    expect(wavePlayed(0.5, 0)).toBe(0)
  })
})

describe("titleWindow", () => {
  test("centres a title that fits", () => {
    const out = titleWindow("Vegas", 21, 0)
    expect(out).toHaveLength(21)
    expect(out).toBe("        Vegas        ")
  })

  test("scrolls a title that does not, at a fixed width", () => {
    const long = "I Like You (A Happier Song) (with Doja Cat)"
    for (let tick = 0; tick < 60; tick++) {
      expect(titleWindow(long, 32, tick)).toHaveLength(32)
    }
    expect(titleWindow(long, 32, 0)).not.toBe(titleWindow(long, 32, 40))
  })

  test("a fitting title ignores the tick entirely", () => {
    expect(titleWindow("Vegas", 21, 0)).toBe(titleWindow("Vegas", 21, 99))
  })

  test("degenerate widths do not throw", () => {
    expect(titleWindow("anything", 0, 3)).toBe("")
  })
})
