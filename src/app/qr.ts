import QRCode from "qrcode"
import { contactCopy, portfolioUrl } from "./content"

// Quiet-zone modules baked into the strings. Exported because callers that
// label a code have to indent by it to line up with the symbol's VISIBLE edge
// — the zone is required whitespace, so the rows start with blank columns.
export const QUIET = 2

export type QrEntry = {
  rows: string[]
  width: number
  height: number
  caption: string
  url: string
}

function generateQr(text: string, caption: string, url: string): QrEntry {
  const qr = QRCode.create(text, { errorCorrectionLevel: "L" })
  const size = qr.modules.size

  const dark = (r: number, c: number): boolean => {
    const rr = r - QUIET
    const cc = c - QUIET
    if (rr < 0 || cc < 0 || rr >= size || cc >= size) return false
    return !!qr.modules.get(rr, cc)
  }

  const total = size + QUIET * 2
  const rows: string[] = []
  for (let r = 0; r < total; r += 2) {
    let line = ""
    for (let c = 0; c < total; c++) {
      const top = dark(r, c)
      const bot = r + 1 < total ? dark(r + 1, c) : false
      line += top && bot ? "█" : top ? "▀" : bot ? "▄" : " "
    }
    rows.push(line)
  }

  return { rows, width: total, height: rows.length, caption, url }
}

export const QR_ENTRIES: QrEntry[] = [
  generateQr(portfolioUrl, "SCAN · PORTFOLIO", portfolioUrl),
  generateQr(contactCopy.linkedin, "SCAN · LINKEDIN", contactCopy.linkedin),
]

// The two above are built once at module load because their URLs are constants.
// A now-playing track URL is not: it changes per song, so its symbol has to be
// generated on demand and remembered — encoding costs a few ms, and every
// session on the music page would otherwise pay it on every repaint.
const DYNAMIC_MAX = 8
const dynamic = new Map<string, QrEntry>()

/**
 * Returns null rather than throwing. A QR for a URL is decoration on a page
 * that must still render if the encoder rejects the input.
 */
export function qrForUrl(url: string, caption: string): QrEntry | null {
  if (!url) return null

  const hit = dynamic.get(url)
  if (hit) {
    // Re-insert to keep the Map's insertion order LRU.
    dynamic.delete(url)
    dynamic.set(url, hit)
    return hit
  }

  try {
    const entry = generateQr(url, caption, url)
    dynamic.set(url, entry)
    while (dynamic.size > DYNAMIC_MAX) {
      const oldest = dynamic.keys().next().value
      if (oldest === undefined) break
      dynamic.delete(oldest)
    }
    return entry
  } catch {
    return null
  }
}

// Backward-compatible: the first entry's rows
export const QR_ROWS = QR_ENTRIES[0]!.rows
export const QR_WIDTH = Math.max(...QR_ENTRIES.map((e) => e.width))
export const QR_HEIGHT = Math.max(...QR_ENTRIES.map((e) => e.height))
