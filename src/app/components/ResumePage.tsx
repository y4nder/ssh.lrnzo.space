import { TextAttributes } from "@opentui/core"
import { useMemo } from "react"
import { identity } from "../content"
import { useStreamReveal } from "../hooks/useStreamReveal"
import { resumeLineLength, resumeRows, type ResumeLine } from "../resume"
import { useTheme } from "../theme"
import { Cursor } from "./Cursor"
import { Label } from "./Label"
import { Rule } from "./Rule"
import { StatusBar } from "./StatusBar"

// The CV takeover: `r` swaps the entire frame — masthead, tabs, everything —
// for this dedicated document page; esc returns to the regular app. App owns
// `scroll` (j/k move it a line at a time); this component renders the visible
// window of the pre-wrapped line array from buildResumeLines. Lines stream in
// typewriter-style the first time the viewport exposes them (useStreamReveal)
// and render instantly ever after.
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

  const lineLengths = useMemo(() => lines.map((l) => resumeLineLength(l, width)), [lines, width])
  // `lines` only rebuilds when the frame width changes, so width doubles as
  // the reveal's resetKey: a re-wrap latches instead of retyping.
  const { shownFor, activeLine } = useStreamReveal(lineLengths, offset, offset + visible.length, width)

  const render = (line: ResumeLine, key: number) => {
    const n = shownFor(key)
    const cursor = key === activeLine ? <Cursor blink={false} /> : null
    switch (line.kind) {
      case "blank":
        return (
          <text key={key} flexShrink={0}>
            {" "}
          </text>
        )
      case "rule":
        // Sweeps left to right; Rule floors at 1 char, hence the blank guard.
        return n === 0 ? (
          <text key={key} height={1} flexShrink={0}>
            {" "}
          </text>
        ) : (
          <Rule key={key} width={n} />
        )
      case "heading":
        return <Label key={key} text={line.text.slice(0, n) || " "} accent />
      case "center": {
        // Fixed left pad instead of justifyContent: re-centering a growing
        // slice would jitter the line sideways on every tick.
        const full = line.bold ? line.text.toUpperCase() : line.text
        const pad = " ".repeat(Math.max(0, Math.floor((width - full.length) / 2)))
        const t = full.slice(0, n)
        return (
          <text
            key={key}
            height={1}
            flexShrink={0}
            fg={line.dim ? theme.dim : theme.fg}
            attributes={line.bold ? TextAttributes.BOLD : undefined}
          >
            {pad + t || " "}
            {cursor}
          </text>
        )
      }
      case "split": {
        // Left column types first, then the right. The right column keeps its
        // full-width padding (cursor replaces one pad cell) so the right edge
        // never slides while it grows.
        const leftShown = Math.min(n, line.left.length)
        const rightShown = Math.max(0, n - line.left.length)
        const rightCursor = cursor && leftShown === line.left.length ? cursor : null
        const rightPad = " ".repeat(Math.max(0, line.right.length - rightShown - (rightCursor ? 1 : 0)))
        return (
          <box key={key} flexDirection="row" width="100%" height={1}>
            <text flexShrink={1} fg={theme.fg} attributes={TextAttributes.BOLD}>
              {line.left.slice(0, leftShown).toUpperCase() || " "}
              {rightCursor ? null : cursor}
            </text>
            <box flexGrow={1} minWidth={1} />
            <text flexShrink={0} fg={theme.dim}>
              {line.right.slice(0, rightShown).toUpperCase()}
              {rightCursor}
              {rightPad}
            </text>
          </box>
        )
      }
      case "text": {
        const t = line.text.slice(0, n)
        return (
          <text key={key} height={1} flexShrink={0} fg={line.dim ? theme.dim : theme.fg}>
            {t || " "}
            {cursor}
          </text>
        )
      }
      case "bullet": {
        const t = ((line.first ? "✱ " : "  ") + line.text).slice(0, n)
        return line.first ? (
          <text key={key} height={1} flexShrink={0} fg={theme.fg}>
            <span fg={theme.accent}>{t.slice(0, 2)}</span>
            {t.slice(2)}
            {cursor}
            {t.length === 0 ? " " : null}
          </text>
        ) : (
          <text key={key} height={1} flexShrink={0} fg={theme.fg}>
            {t || " "}
            {cursor}
          </text>
        )
      }
      case "end": {
        const full = "✱ END OF DOCUMENT"
        const pad = " ".repeat(Math.max(0, Math.floor((width - full.length) / 2)))
        const t = full.slice(0, n)
        return (
          <text key={key} height={1} flexShrink={0}>
            {pad || (t ? null : " ")}
            <span fg={theme.accent}>{t.slice(0, 2)}</span>
            <span fg={theme.dim}>{t.slice(2)}</span>
            {cursor}
          </text>
        )
      }
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
