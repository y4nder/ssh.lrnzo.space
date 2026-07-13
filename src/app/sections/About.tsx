import { about, theme } from "../content"

export function About() {
  return (
    <box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <text fg={theme.accent}>about</text>
      <text> </text>
      {about.bio.map((line, i) => (
        <text key={i} fg={theme.fg}>
          {line || " "}
        </text>
      ))}
      <text> </text>
      <text fg={theme.accent}>skills</text>
      <text> </text>
      {about.skills.map((skill) => (
        <text key={skill} fg={theme.fg}>
          <span fg={theme.green}>▪ </span>
          {skill}
        </text>
      ))}
    </box>
  )
}
