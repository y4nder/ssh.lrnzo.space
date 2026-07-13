import { projects, theme } from "../content"

export function Projects() {
  return (
    <box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <text fg={theme.accent}>projects</text>
      <text> </text>
      {projects.map((p) => (
        <box key={p.name} flexDirection="column" marginBottom={1}>
          <text fg={theme.yellow}>{p.name}</text>
          <text fg={theme.fg}>{p.tagline}</text>
          <text fg={theme.dim}>{p.tech}</text>
          {p.url ? <text fg={theme.purple}>{p.url}</text> : null}
        </box>
      ))}
    </box>
  )
}
