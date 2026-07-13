// Rough wrapped-line estimate for fitting paragraphs into a fixed-height
// detail pane. Greedy character count is close enough for truncation math.
export function wrapEstimate(text: string, width: number): number {
  if (width <= 0) return 1
  return Math.max(1, Math.ceil(text.length / width))
}

// Greedy word wrap returning the actual lines (wrapEstimate only counts
// them). Words longer than the width are hard-broken so no line overflows.
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

// Fit as many items as possible into maxRows (each item costs its wrapped
// height). When items are dropped, one row is reserved for a "+N MORE" line —
// the total including that line NEVER exceeds maxRows, because a single
// overflowing row makes yoga shrink siblings to zero height and their glyphs
// then overpaint neighboring rows.
export function fitLines(
  items: string[],
  width: number,
  maxRows: number,
  // Callers that render their own overflow indicator outside the budget
  // (DetailView) pass false; inline "+N MORE" renderers keep the reserve.
  reserveMoreRow = true,
): { shown: string[]; hidden: number } {
  const costs = items.map((t) => wrapEstimate(t, width))
  if (costs.reduce((a, b) => a + b, 0) <= maxRows) return { shown: items, hidden: 0 }
  const budget = reserveMoreRow ? maxRows - 1 : maxRows
  let used = 0
  const shown: string[] = []
  for (let i = 0; i < items.length; i++) {
    if (used + costs[i]! > budget) break
    shown.push(items[i]!)
    used += costs[i]!
  }
  // Never show nothing: a clipped first item beats an empty pane.
  if (shown.length === 0 && items.length > 0) shown.push(items[0]!)
  return { shown, hidden: items.length - shown.length }
}
