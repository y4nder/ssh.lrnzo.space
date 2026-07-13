import { TextAttributes } from "@opentui/core"
import { experience } from "../content"
import { useTheme } from "../theme"
import { Label } from "../components/Label"
import { Rule } from "../components/Rule"
import { SelectableList } from "../components/SelectableList"
import { Cursor } from "../components/Cursor"
import { useTypewriter } from "../hooks/useTypewriter"
import { fitLines } from "../util"

export function Experience({
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
  const count = experience.length

  const listVisible = Math.min(count, Math.max(3, height - 12))
  const listBlock = listVisible + (count > listVisible ? 2 : 0)
  const detailRows = Math.max(3, height - listBlock - 2)

  const entry = experience[selected]!
  const meta = [entry.dates, entry.location, entry.type].filter(Boolean).join(" · ")
  const paragraphs = [
    ...(entry.summary ? [entry.summary] : []),
    ...entry.bullets.map((b) => `✱ ${b}`),
  ]
  // title + meta + blank + skills line stay fixed; paragraphs get the rest.
  // fitLines returns physical pre-wrapped lines rendered as fixed-height rows
  // so the typewriter reveal can't reflow the "+N MORE" or STACK rows;
  // j/k changes `selected`, restarting per item.
  const { lines: fitted, hidden } = fitLines(
    paragraphs,
    contentWidth - 2,
    Math.max(1, detailRows - 4),
  )
  const { lines: typed, activeLine } = useTypewriter(fitted, selected)

  return (
    <box flexDirection="column" width="100%">
      <Label text="N2 / Experience" />
      <SelectableList
        count={count}
        selected={selected}
        visible={listVisible}
        renderRow={(i, isSelected) => {
          const e = experience[i]!
          return (
            <>
              <text flexShrink={0} fg={isSelected ? theme.barFg : theme.dim}>
                {" "}
                N{i + 1}{" "}
              </text>
              <text fg={isSelected ? theme.barFg : theme.fg} flexGrow={1} flexShrink={1} height={1}>
                {e.role.toUpperCase()} — {e.company.toUpperCase()}
              </text>
              <text flexShrink={0} fg={isSelected ? theme.barFg : theme.dim}>
                {e.dates.toUpperCase()}{" "}
              </text>
            </>
          )
        }}
      />
      <Rule width={width} />
      <box flexDirection="column" width="100%">
        <text flexShrink={0}>
          <span fg={theme.fg} attributes={TextAttributes.BOLD}>
            {entry.role.toUpperCase()}
          </span>
          <span fg={theme.accent}> ✱ </span>
          <span fg={theme.fg}>{entry.company.toUpperCase()}</span>
        </text>
        <text flexShrink={0} fg={theme.dim}>
          {meta.toUpperCase()}
        </text>
        <text flexShrink={0}> </text>
        {fitted.map((line, i) => {
          const t = typed[i] ?? ""
          return line.startsWith("✱ ") ? (
            <text key={i} height={1} flexShrink={0} fg={theme.fg}>
              <span fg={theme.accent}>{t.slice(0, 2)}</span>
              {t.slice(2)}
              {i === activeLine ? <Cursor blink={false} /> : null}
              {t.length === 0 ? " " : null}
            </text>
          ) : (
            <text key={i} height={1} flexShrink={0} fg={theme.fg}>
              {t || " "}
              {i === activeLine ? <Cursor blink={false} /> : null}
            </text>
          )
        })}
        {hidden > 0 ? (
          <text flexShrink={0} fg={theme.dim}>
            … +{hidden} MORE (ENTER)
          </text>
        ) : null}
        <text flexShrink={0} fg={theme.dim}>
          STACK: {entry.skills.join(" · ").toUpperCase()}
        </text>
      </box>
    </box>
  )
}
