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
