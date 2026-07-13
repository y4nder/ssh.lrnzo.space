import { TextAttributes } from "@opentui/core"
import type { DetailRecord } from "../detail"
import { useTheme } from "../theme"
import { useTypewriter } from "../hooks/useTypewriter"
import { fitLines } from "../util"
import { Cursor } from "./Cursor"
import { Label } from "./Label"

// Full-screen record page opened with enter on a list row. Paragraphs
// scroll by whole items via `scroll` (owned by App: j/k adjust it), so every
// bullet is reachable at any terminal size.
export function DetailView({
  record,
  height,
  width,
  scroll,
}: {
  record: DetailRecord
  height: number
  width: number
  scroll: number
}) {
  const theme = useTheme()
  // On cramped panes drop the spacer and stack rows so paragraphs get room.
  const roomy = height >= 10
  // crumb + title + meta + two scroll indicators (+ blank + stack when roomy)
  const chrome = 5 + (roomy ? 1 : 0) + (roomy && record.stack ? 1 : 0)
  const rows = Math.max(1, height - chrome)
  const paragraphs = record.paragraphs.slice(scroll)
  // fitLines returns physical pre-wrapped lines rendered as fixed-height rows
  // so the typewriter reveal can't reflow anything below it. crumb identifies
  // the record (App rebuilds the record object every render); scroll as
  // skipKey completes the text on j/k.
  const { lines: fitted, hidden } = fitLines(paragraphs, width - 2, rows, false)
  const { lines: typed, activeLine } = useTypewriter(fitted, record.crumb, scroll)

  return (
    <box flexDirection="column" width="100%">
      <Label text={record.crumb} />
      <text flexShrink={0}>
        <span fg={theme.fg} attributes={TextAttributes.BOLD}>
          {record.title.toUpperCase()}
        </span>
        {record.suffix?.kind === "end" ? <span fg={theme.accent}>.END</span> : null}
        {record.suffix?.kind === "star" ? (
          <span>
            <span fg={theme.accent}> ✱ </span>
            <span fg={theme.fg}>{record.suffix.text.toUpperCase()}</span>
          </span>
        ) : null}
      </text>
      <text flexShrink={0} fg={theme.dim}>
        {record.meta.toUpperCase()}
      </text>
      {roomy ? <text flexShrink={0}> </text> : null}
      <text flexShrink={0} fg={theme.dim}>
        {scroll > 0 ? "↑ MORE" : " "}
      </text>
      {fitted.map((line, i) => {
        const t = typed[i] ?? ""
        return line.startsWith("✱ ") ? (
          <text key={scroll + i} height={1} flexShrink={0} fg={theme.fg}>
            <span fg={theme.accent}>{t.slice(0, 2)}</span>
            {t.slice(2)}
            {i === activeLine ? <Cursor blink={false} /> : null}
            {t.length === 0 ? " " : null}
          </text>
        ) : (
          <text key={scroll + i} height={1} flexShrink={0} fg={theme.fg}>
            {t || " "}
            {i === activeLine ? <Cursor blink={false} /> : null}
          </text>
        )
      })}
      <text flexShrink={0} fg={theme.dim}>
        {hidden > 0 ? `↓ +${hidden} MORE` : " "}
      </text>
      {roomy && record.stack ? (
        <text flexShrink={0} fg={theme.dim}>
          STACK: {record.stack.toUpperCase()}
        </text>
      ) : null}
    </box>
  )
}
