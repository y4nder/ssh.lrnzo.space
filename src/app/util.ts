// Greedy word wrap returning the actual lines. Words longer than the width
// are hard-broken so no line overflows.
export function wrapText(text: string, width: number): string[] {
  if (width <= 0 || text.length <= width) return [text]
  const lines: string[] = []
  let current = ""
  for (const word of text.split(" ")) {
    let piece = word
    while (piece.length > width) {
      if (current) {
        lines.push(current)
        current = ""
      }
      lines.push(piece.slice(0, width))
      piece = piece.slice(width)
    }
    if (!current) current = piece
    else if (current.length + 1 + piece.length <= width) current += " " + piece
    else {
      lines.push(current)
      current = piece
    }
  }
  if (current) lines.push(current)
  return lines.length > 0 ? lines : [text]
}

// Fit as many items as possible into maxRows and return their PHYSICAL
// wrapped lines — callers render each as a fixed height={1} row, so the
// count must be exact: one extra row overflows the frame and yoga shrinks
// sibling rows (header, tab bar) to zero height, blanking them. When items
// are dropped, one row is reserved for a "+N MORE" line so the total
// including it never exceeds maxRows.
export function fitLines(
  items: string[],
  width: number,
  maxRows: number,
  // Callers that render their own overflow indicator outside the budget
  // (DetailView) pass false; inline "+N MORE" renderers keep the reserve.
  reserveMoreRow = true,
): { lines: string[]; hidden: number } {
  const wrapped = items.map((t) => wrapText(t, width))
  if (wrapped.reduce((a, w) => a + w.length, 0) <= maxRows)
    return { lines: wrapped.flat(), hidden: 0 }
  const budget = reserveMoreRow ? maxRows - 1 : maxRows
  const lines: string[] = []
  let taken = 0
  for (const w of wrapped) {
    if (lines.length + w.length > budget) break
    lines.push(...w)
    taken++
  }
  // Never show nothing: a clipped first item beats an empty pane.
  if (taken === 0 && items.length > 0) {
    lines.push(...wrapped[0]!.slice(0, Math.max(1, budget)))
    taken = 1
  }
  return { lines, hidden: items.length - taken }
}
