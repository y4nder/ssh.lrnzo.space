import { contact, identity } from "../content"
import { useTheme } from "../theme"
import { Label } from "../components/Label"
import { QR_HEIGHT, QR_ROWS, QR_WIDTH } from "../qr"

export function Contact({ width, height }: { width: number; height: number }) {
  const theme = useTheme()
  const rows: Array<[string, string]> = [
    ["email", contact.email],
    ["github", contact.github],
    ["linkedin", contact.linkedin],
    ["this site", contact.ssh],
  ]
  // Left column needs ~34 cols (12-pad label + longest value) plus a gap;
  // vertically: Label + blank + QR rows + caption.
  const showQr = width >= QR_WIDTH + 39 && height >= QR_HEIGHT + 3
  return (
    <box flexDirection="column" width="100%">
      <Label text="N5 / Contact" />
      <text flexShrink={0}> </text>
      <box flexDirection="row" width="100%">
        <box flexDirection="column" flexGrow={1}>
          {rows.map(([label, value]) => (
            <text key={label} flexShrink={0} fg={theme.fg}>
              <span fg={theme.dim}>{label.toUpperCase().padEnd(12)}</span>
              {value}
            </text>
          ))}
          <text flexShrink={0}> </text>
          <text flexShrink={0}>
            <span fg={theme.accent}>✱ </span>
            <span fg={theme.dim}>STAY CONNECTED — {identity.host.toUpperCase()}</span>
          </text>
        </box>
        {showQr ? (
          <box flexDirection="column" width={QR_WIDTH} flexShrink={0} marginRight={1}>
            {QR_ROWS.map((line, i) => (
              <text key={i} height={1} flexShrink={0} fg={theme.accent}>
                {line}
              </text>
            ))}
            <text flexShrink={0} fg={theme.dim}>
              {"  SCAN · LINKEDIN"}
            </text>
          </box>
        ) : null}
      </box>
    </box>
  )
}
