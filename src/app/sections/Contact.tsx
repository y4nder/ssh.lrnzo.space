import { contact, identity } from "../content"
import { useTheme } from "../theme"
import { Label } from "../components/Label"
import { Cursor } from "../components/Cursor"
import { useTypewriter } from "../hooks/useTypewriter"
import { useFlashIn } from "../hooks/useFlashIn"
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

  // Rows type as one budget; the dim label / fg value spans are rebuilt from
  // the typed slice at the fixed 12-col pad boundary so colors survive the
  // partial reveal. Contact remounts on nav, so resetKey 0 retypes per visit.
  const stayIdx = rows.length + 1
  const lines = [
    ...rows.map(([label, value]) => label.toUpperCase().padEnd(12) + value),
    "",
    `✱ STAY CONNECTED — ${identity.host.toUpperCase()}`,
  ]
  const { lines: typed, done, activeLine } = useTypewriter(lines, 0)
  // QR strobes in only after the text finishes typing. The box stays mounted
  // at full size throughout so the reveal never reflows the left column.
  const flash = useFlashIn(done)
  const qrVisible = flash === "bright" || flash === "shown"

  return (
    <box flexDirection="column" width="100%">
      <Label text="N5 / Contact" />
      <text flexShrink={0}> </text>
      <box flexDirection="row" width="100%">
        <box flexDirection="column" flexGrow={1}>
          {rows.map(([label], i) => {
            const t = typed[i] ?? ""
            return (
              <text key={label} height={1} flexShrink={0} fg={theme.fg}>
                <span fg={theme.dim}>{t.slice(0, 12)}</span>
                {t.slice(12)}
                {i === activeLine ? <Cursor blink={false} /> : null}
                {t.length === 0 ? " " : null}
              </text>
            )
          })}
          <text flexShrink={0}> </text>
          <text height={1} flexShrink={0}>
            <span fg={theme.accent}>{(typed[stayIdx] ?? "").slice(0, 2)}</span>
            <span fg={theme.dim}>{(typed[stayIdx] ?? "").slice(2)}</span>
            {stayIdx === activeLine ? <Cursor blink={false} /> : null}
            {(typed[stayIdx] ?? "").length === 0 ? " " : null}
          </text>
        </box>
        {showQr ? (
          <box flexDirection="column" width={QR_WIDTH} flexShrink={0} marginRight={1}>
            {QR_ROWS.map((line, i) => (
              <text
                key={i}
                height={1}
                flexShrink={0}
                fg={flash === "bright" ? "#ffffff" : theme.accent}
              >
                {qrVisible ? line : " "}
              </text>
            ))}
            <text flexShrink={0} fg={theme.dim}>
              {flash === "shown" ? "  SCAN · LINKEDIN" : " "}
            </text>
          </box>
        ) : null}
      </box>
    </box>
  )
}
