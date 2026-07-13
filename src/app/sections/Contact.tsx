import { contact, identity } from "../content"
import { useTheme } from "../theme"
import { Label } from "../components/Label"

export function Contact() {
  const theme = useTheme()
  const rows: Array<[string, string]> = [
    ["email", contact.email],
    ["github", contact.github],
    ["linkedin", contact.linkedin],
    ["this site", contact.ssh],
  ]
  return (
    <box flexDirection="column" width="100%">
      <Label text="N5 / Contact" />
      <text flexShrink={0}> </text>
      {rows.map(([label, value]) => (
        <text key={label} flexShrink={0} fg={theme.fg}>
          <span fg={theme.dim}>{label.toUpperCase().padEnd(12)}</span>
          {value}
        </text>
      ))}
      <text flexShrink={0}> </text>
      <text flexShrink={0}>
        <span fg={theme.accent}>✳ </span>
        <span fg={theme.dim}>STAY CONNECTED — {identity.host.toUpperCase()}</span>
      </text>
    </box>
  )
}
