import { contact, identity, theme } from "../content"

export function Contact() {
  const rows: Array<[string, string]> = [
    ["email", contact.email],
    ["github", contact.github],
    ["linkedin", contact.linkedin],
    ["this site", identity.sshCommand],
  ]
  return (
    <box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <text fg={theme.accent}>contact</text>
      <text> </text>
      {rows.map(([label, value]) => (
        <text key={label} fg={theme.fg}>
          <span fg={theme.dim}>{label.padEnd(10)}</span>
          {value}
        </text>
      ))}
    </box>
  )
}
