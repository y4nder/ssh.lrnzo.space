import { TextAttributes } from "@opentui/core"
import { honors } from "../content"
import { useTheme } from "../theme"
import { Label } from "../components/Label"
import { Rule } from "../components/Rule"
import { SelectableList } from "../components/SelectableList"
import { fitLines } from "../util"

export function Honors({
  selected,
  height,
  width,
}: {
  selected: number
  height: number
  width: number
}) {
  const theme = useTheme()
  const contentWidth = width
  const count = honors.length

  const listVisible = Math.min(count, Math.max(3, height - 10))
  const listBlock = listVisible + (count > listVisible ? 2 : 0)
  const detailRows = Math.max(3, height - listBlock - 2)

  const h = honors[selected]!
  const { shown, hidden } = fitLines(
    h.blurb ? [h.blurb] : [],
    contentWidth - 2,
    Math.max(1, detailRows - 3),
  )

  return (
    <box flexDirection="column" width="100%">
      <Label text="N4 / Honors" />
      <SelectableList
        count={count}
        selected={selected}
        visible={listVisible}
        renderRow={(i, isSelected) => {
          const honor = honors[i]!
          return (
            <>
              <text flexShrink={0} fg={isSelected ? theme.barFg : theme.dim}>
                {" "}
                N{i + 1}{" "}
              </text>
              <text fg={isSelected ? theme.barFg : theme.fg} flexGrow={1} flexShrink={1} height={1}>
                {honor.title.toUpperCase()}
              </text>
              <text flexShrink={0} fg={isSelected ? theme.barFg : theme.dim}>
                {honor.date.toUpperCase()}{" "}
              </text>
            </>
          )
        }}
      />
      <Rule width={width} />
      <box flexDirection="column" width="100%">
        <text flexShrink={0} fg={theme.fg} attributes={TextAttributes.BOLD}>
          {h.title.toUpperCase()}
        </text>
        <text flexShrink={0} fg={theme.dim}>
          {h.issuer.toUpperCase()} · {h.date.toUpperCase()}
        </text>
        <text flexShrink={0}> </text>
        {shown.map((line, i) => (
          <text key={i} flexShrink={0} fg={theme.fg}>
            {line}
          </text>
        ))}
        {hidden > 0 ? (
          <text flexShrink={0} fg={theme.dim}>
            … MORE (ENTER)
          </text>
        ) : null}
      </box>
    </box>
  )
}
