import QRCode from "qrcode"
import { contact } from "./content"

// Lowercase is required — the LinkedIn path is case-sensitive (/IN/Y4NDER
// doesn't resolve). Byte mode at level L keeps version 2 (25×25); level M
// would force version 3 and a bigger footprint.
const QR_TEXT = `https://${contact.linkedin}`
const QUIET = 2 // quiet-zone modules baked into the strings

const qr = QRCode.create(QR_TEXT, { errorCorrectionLevel: "L" })
const size = qr.modules.size

const dark = (r: number, c: number): boolean => {
  const rr = r - QUIET
  const cc = c - QUIET
  if (rr < 0 || cc < 0 || rr >= size || cc >= size) return false
  return !!qr.modules.get(rr, cc)
}

// Half-block rendering: each terminal row carries two module rows. Modules
// paint with fg only — the accent-on-dark result is an inverted QR, which
// modern phone scanners decode.
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

export const QR_ROWS = rows
export const QR_WIDTH = total
export const QR_HEIGHT = rows.length
