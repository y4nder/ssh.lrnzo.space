import type { GuestbookEntry } from "../db"
import { wrapText } from "./util"

// Guestbook entries flattened into one line per terminal row, mirroring
// resume.ts: GuestbookPage renders a slice of this array, so wrapping is
// resolved here at build time (the layout never relies on yoga text flow).
export type GbLine =
  | { kind: "blank" }
  | { kind: "meta"; name: string; date: string }
  | { kind: "text"; text: string }
  | { kind: "empty" }
  | { kind: "end" }

// Rows the guestbook page spends outside the entry list: header + heavy rule
// + ↑/↓ indicators + bottom rule + status bar.
export const GB_CHROME = 6

export function gbRows(frameH: number): number {
  return Math.max(1, frameH - GB_CHROME)
}

export function buildGuestbookLines(entries: GuestbookEntry[], width: number): GbLine[] {
  const lines: GbLine[] = []
  if (entries.length === 0) {
    lines.push({ kind: "blank" })
    lines.push({ kind: "empty" })
    return lines
  }
  entries.forEach((entry, i) => {
    if (i > 0) lines.push({ kind: "blank" })
    lines.push({ kind: "meta", name: entry.name, date: entry.created_at.slice(0, 10) })
    for (const line of wrapText(entry.message, width - 2)) lines.push({ kind: "text", text: line })
  })
  lines.push({ kind: "blank" })
  lines.push({ kind: "end" })
  return lines
}
