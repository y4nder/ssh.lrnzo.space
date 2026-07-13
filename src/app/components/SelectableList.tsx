import type { ReactNode } from "react"
import { useListWindow } from "../hooks/useListWindow"
import { useTheme } from "../theme"

// Windowed list with a full-row accent background bar on the selected row —
// the block-highlight selection instead of a bordered panel.
export function SelectableList({
  count,
  selected,
  visible,
  renderRow,
}: {
  count: number
  selected: number
  visible: number
  renderRow: (index: number, isSelected: boolean) => ReactNode
}) {
  const theme = useTheme()
  const shown = Math.min(count, visible)
  const offset = useListWindow(selected, count, shown)
  const rows = []
  for (let i = offset; i < Math.min(count, offset + shown); i++) {
    const isSelected = i === selected
    rows.push(
      <box
        key={i}
        flexDirection="row"
        width="100%"
        height={1}
        overflow="hidden"
        flexShrink={0}
        backgroundColor={isSelected ? theme.barBg : undefined}
      >
        {renderRow(i, isSelected)}
      </box>,
    )
  }
  // When the list overflows, both indicator lines are always rendered (blank
  // at the edges) so the layout height never jumps while scrolling.
  const overflows = count > shown
  return (
    <box flexDirection="column" width="100%" flexShrink={0}>
      {overflows ? (
        <text flexShrink={0} fg={theme.dim}>
          {offset > 0 ? "↑ MORE" : " "}
        </text>
      ) : null}
      {rows}
      {overflows ? (
        <text flexShrink={0} fg={theme.dim}>
          {offset + shown < count ? "↓ MORE" : " "}
        </text>
      ) : null}
    </box>
  )
}
