// Rough wrapped-line estimate for fitting paragraphs into a fixed-height
// detail pane. Greedy character count is close enough for truncation math.
export function wrapEstimate(text: string, width: number): number {
  if (width <= 0) return 1
  return Math.max(1, Math.ceil(text.length / width))
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
): { shown: string[]; hidden: number } {
  const costs = items.map((t) => wrapEstimate(t, width))
  if (costs.reduce((a, b) => a + b, 0) <= maxRows) return { shown: items, hidden: 0 }
  const budget = maxRows - 1 // the "+N MORE" line
  let used = 0
  const shown: string[] = []
  for (let i = 0; i < items.length; i++) {
    if (used + costs[i]! > budget) break
    shown.push(items[i]!)
    used += costs[i]!
  }
  return { shown, hidden: items.length - shown.length }
}
