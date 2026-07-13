import { about } from "../content"
import { useTheme } from "../theme"
import { Label } from "../components/Label"

export function About() {
  const theme = useTheme()
  // Two-column skills keep the section short enough for small terminals.
  const half = Math.ceil(about.skills.length / 2)
  const left = about.skills.slice(0, half)
  const right = about.skills.slice(half)

  return (
    <box flexDirection="column" width="100%">
      <Label text="N1 / About" />
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
              <span fg={theme.accent}>✳ </span>
              {skill}
            </text>
          </box>
          {right[i] ? (
            <text fg={theme.fg}>
              <span fg={theme.accent}>✳ </span>
              {right[i]}
            </text>
          ) : null}
        </box>
      ))}
    </box>
  )
}
