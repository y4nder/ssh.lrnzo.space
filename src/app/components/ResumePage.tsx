import { TextAttributes } from "@opentui/core"
import { identity } from "../content"
import { resumeRows, type ResumeLine } from "../resume"
import { useTheme } from "../theme"
import { Label } from "./Label"
import { Rule } from "./Rule"
import { StatusBar } from "./StatusBar"

// The CV takeover: `r` swaps the entire frame — masthead, tabs, everything —
// for this dedicated document page; esc returns to the regular app. App owns
// `scroll` (j/k move it a line at a time); this component renders the visible
// window of the pre-wrapped line array from buildResumeLines.
export function ResumePage({
  lines,
  scroll,
  width,
  height,
}: {
  lines: ResumeLine[]
  scroll: number
  width: number
  height: number
}) {
  const theme = useTheme()
  const rows = resumeRows(height)
  // Clamp against the current window so a resize never scrolls past the end.
  const offset = Math.min(scroll, Math.max(0, lines.length - rows))
  const visible = lines.slice(offset, offset + rows)
  const below = lines.length - offset - visible.length

  const render = (line: ResumeLine, key: number) => {
    switch (line.kind) {
      case "blank":
        return (
          <text key={key} flexShrink={0}>
            {" "}
          </text>
        )
      case "rule":
        return <Rule key={key} width={width} />
      case "heading":
        return <Label key={key} text={line.text} accent />
      case "center":
        return (
          <box key={key} flexDirection="row" width="100%" height={1} justifyContent="center">
            <text
              flexShrink={1}
              fg={line.dim ? theme.dim : theme.fg}
              attributes={line.bold ? TextAttributes.BOLD : undefined}
            >
              {line.bold ? line.text.toUpperCase() : line.text}
            </text>
          </box>
        )
      case "split":
        return (
          <box key={key} flexDirection="row" width="100%" height={1}>
            <text flexShrink={1} fg={theme.fg} attributes={TextAttributes.BOLD}>
              {line.left.toUpperCase()}
            </text>
            <box flexGrow={1} minWidth={1} />
            <text flexShrink={0} fg={theme.dim}>
              {line.right.toUpperCase()}
            </text>
          </box>
        )
      case "text":
        return (
          <text key={key} flexShrink={0} fg={line.dim ? theme.dim : theme.fg}>
            {line.text}
          </text>
        )
      case "bullet":
        return line.first ? (
          <text key={key} flexShrink={0} fg={theme.fg}>
            <span fg={theme.accent}>✱ </span>
            {line.text}
          </text>
        ) : (
          <text key={key} flexShrink={0} fg={theme.fg}>
            {"  " + line.text}
          </text>
        )
      case "end":
        return (
          <box key={key} flexDirection="row" width="100%" height={1} justifyContent="center">
            <text flexShrink={0}>
              <span fg={theme.accent}>✱ </span>
              <span fg={theme.dim}>END OF DOCUMENT</span>
            </text>
          </box>
        )
    }
  }

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexDirection="row" width="100%" height={1} flexShrink={0}>
        <text flexShrink={1} fg={theme.fg} attributes={TextAttributes.BOLD}>
          CURRICULUM VITAE
        </text>
        <text flexShrink={0} fg={theme.accent}>
          {" "}
          ✱
        </text>
        <box flexGrow={1} minWidth={1} />
        <text flexShrink={0} fg={theme.dim}>
          OXFORD FORMAT
        </text>
      </box>
      <Rule heavy width={width} />
      <text flexShrink={0} fg={theme.dim}>
        {offset > 0 ? "↑ MORE" : " "}
      </text>
      {visible.map((line, i) => render(line, offset + i))}
      <text flexShrink={0} fg={theme.dim}>
        {below > 0 ? `↓ +${below} MORE` : " "}
      </text>
      <box flexGrow={1} />
      <Rule width={width} />
      <StatusBar
        hints={[
          { key: "esc", label: "back" },
          { key: "j/k", label: "scroll" },
          { key: "t", label: "theme" },
          { key: "q", label: "quit" },
        ]}
        right={`${identity.banner}.cv ✱`}
      />
    </box>
  )
}
