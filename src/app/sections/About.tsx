import { about } from "../content"
import { useTheme } from "../theme"
import { Label } from "../components/Label"
import { Cursor } from "../components/Cursor"
import { usePresence } from "../hooks/usePresence"
import { useTypewriter } from "../hooks/useTypewriter"

export function About({ visitorNumber }: { visitorNumber: number }) {
  const theme = useTheme()
  const online = usePresence()
  // Two-column skills keep the section short enough for small terminals.
  const half = Math.ceil(about.skills.length / 2)
  const left = about.skills.slice(0, half)
  const right = about.skills.slice(half)

  // One character budget covers the bio and the skill grid: the bio types
  // char-by-char, then each skill row pops in whole once its share of the
  // budget is spent — row text is in the array only for its length, so the
  // accent ✱ spans never get sliced mid-span. About remounts on nav, so the
  // constant resetKey retypes per visit like the list previews do.
  const rows = left.map((skill, i) => skill + (right[i] ?? ""))
  const lines = [...about.bio, "", ...rows]
  const { lines: typed, activeLine } = useTypewriter(lines, 0)

  return (
    <box flexDirection="column" width="100%">
      <Label text="N1 / About" />
      {/* greeting up top — the section bottom clips on short terminals */}
      {visitorNumber > 0 ? (
        <text flexShrink={0}>
          <span fg={theme.accent}>✱ </span>
          <span fg={theme.dim}>
            {/* keep under 64 cols with the star — the minimum frame width */}
            YOU ARE VISITOR N{String(visitorNumber).padStart(4, "0")}
            {online > 1 ? ` · ${online} ONLINE` : ""} · PRESS B FOR THE GUESTBOOK
          </span>
        </text>
      ) : null}
      <text flexShrink={0}> </text>
      {about.bio.map((line, i) => (
        <text key={i} height={1} flexShrink={0} fg={theme.fg}>
          {typed[i] || " "}
          {i === activeLine ? <Cursor blink={false} /> : null}
        </text>
      ))}
      <text flexShrink={0}> </text>
      <Label text="Capabilities" accent />
      {left.map((skill, i) => {
        const li = about.bio.length + 1 + i
        const rowDone = typed[li] === rows[i]
        return (
          <box key={skill} flexDirection="row" flexShrink={0} height={1}>
            {rowDone ? (
              <>
                <box width={32} flexDirection="row">
                  <text fg={theme.fg}>
                    <span fg={theme.accent}>✱ </span>
                    {skill}
                  </text>
                </box>
                {right[i] ? (
                  <text fg={theme.fg}>
                    <span fg={theme.accent}>✱ </span>
                    {right[i]}
                  </text>
                ) : null}
              </>
            ) : (
              // placeholder holds the row height so nothing reflows as rows
              // fill in; the cursor parks on whichever row is up next
              <text fg={theme.fg}>
                {li === activeLine ? <Cursor blink={false} /> : " "}
              </text>
            )}
          </box>
        )
      })}
    </box>
  )
}
