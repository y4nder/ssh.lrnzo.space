import QRCode from "qrcode"
import { contactCopy, portfolioUrl } from "./content"

const QUIET = 2 // quiet-zone modules baked into the strings

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

// Backward-compatible: the first entry's rows
export const QR_ROWS = QR_ENTRIES[0]!.rows
export const QR_WIDTH = Math.max(...QR_ENTRIES.map((e) => e.width))
export const QR_HEIGHT = Math.max(...QR_ENTRIES.map((e) => e.height))
