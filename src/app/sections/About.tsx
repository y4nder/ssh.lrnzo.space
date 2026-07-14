import { about } from "../content"
import { useTheme } from "../theme"
import { Label } from "../components/Label"
import { usePresence } from "../hooks/usePresence"

export function About({ visitorNumber }: { visitorNumber: number }) {
  const theme = useTheme()
  const online = usePresence()
  // Two-column skills keep the section short enough for small terminals.
  const half = Math.ceil(about.skills.length / 2)
  const left = about.skills.slice(0, half)
  const right = about.skills.slice(half)

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
        <text key={i} flexShrink={0} fg={theme.fg}>
          {line || " "}
        </text>
      ))}
      <text flexShrink={0}> </text>
      <Label text="Capabilities" accent />
      {left.map((skill, i) => (
        <box key={skill} flexDirection="row" flexShrink={0}>
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
        </box>
      ))}
    </box>
  )
}
