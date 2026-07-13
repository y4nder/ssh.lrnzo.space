import { TextAttributes } from "@opentui/core"
import { projects } from "../content"
import { useTheme } from "../theme"
import { Label } from "../components/Label"
import { Rule } from "../components/Rule"
import { SelectableList } from "../components/SelectableList"
import { fitLines } from "../util"

export function Projects({
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
  const count = projects.length

  const listVisible = Math.min(count, Math.max(3, height - 12))
  const listBlock = listVisible + (count > listVisible ? 2 : 0)
  const detailRows = Math.max(3, height - listBlock - 2)

  const p = projects[selected]!
  const meta = [p.dates, p.url].filter(Boolean).join(" · ")
  const paragraphs = [p.tagline, ...p.bullets.map((b) => `✱ ${b}`)]
  const { shown, hidden } = fitLines(paragraphs, contentWidth - 2, Math.max(1, detailRows - 4))

  return (
    <box flexDirection="column" width="100%">
      <Label text="N3 / Projects" />
      <SelectableList
        count={count}
        selected={selected}
        visible={listVisible}
        renderRow={(i, isSelected) => {
          const proj = projects[i]!
          return (
            <>
              <text flexShrink={0} fg={isSelected ? theme.barFg : theme.dim}>
                {" "}
                N{i + 1}{" "}
              </text>
              <text fg={isSelected ? theme.barFg : theme.fg} flexGrow={1} flexShrink={1} height={1}>
                {proj.name.toUpperCase()}
              </text>
              <text flexShrink={0} fg={isSelected ? theme.barFg : theme.dim}>
                {(proj.tech[0] ?? "").toUpperCase()}{" "}
              </text>
            </>
          )
        }}
      />
      <Rule width={width} />
      <box flexDirection="column" width="100%">
        <text flexShrink={0}>
          <span fg={theme.fg} attributes={TextAttributes.BOLD}>
            {p.name.toUpperCase()}
          </span>
          <span fg={theme.accent}>.END</span>
        </text>
        <text flexShrink={0} fg={theme.dim}>
          {meta.toUpperCase()}
        </text>
        <text flexShrink={0}> </text>
        {shown.map((line, i) =>
          line.startsWith("✱ ") ? (
            <text key={i} flexShrink={0} fg={theme.fg}>
              <span fg={theme.accent}>✱ </span>
              {line.slice(2)}
            </text>
          ) : (
            <text key={i} flexShrink={0} fg={theme.fg}>
              {line}
            </text>
          ),
        )}
        {hidden > 0 ? (
          <text flexShrink={0} fg={theme.dim}>
            … +{hidden} MORE (ENTER)
          </text>
        ) : null}
        <text flexShrink={0} fg={theme.dim}>
          STACK: {p.tech.join(" · ").toUpperCase()}
        </text>
      </box>
    </box>
  )
}
