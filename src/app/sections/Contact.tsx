import { useEffect, useRef, useState } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { contact, contactCopy, identity } from "../content"
import { useTheme } from "../theme"
import { Label } from "../components/Label"
import { Cursor } from "../components/Cursor"
import { useTypewriter } from "../hooks/useTypewriter"
import { useFlashIn } from "../hooks/useFlashIn"
import { QR_HEIGHT, QR_ROWS, QR_WIDTH } from "../qr"

type Copied = { idx: number | "all"; ok: boolean } | null

export function Contact({ width, height }: { width: number; height: number }) {
  const theme = useTheme()
  const renderer = useRenderer()
  const rows: Array<[string, string, string]> = [
    ["email", contact.email, contactCopy.email],
    ["github", contact.github, contactCopy.github],
    ["linkedin", contact.linkedin, contactCopy.linkedin],
    ["this site", contact.ssh, contactCopy.ssh],
  ]
  // Contact owns y/enter and its own j/k selection — App's handler no-ops on
  // all of these here (listCount is 0), and the component unmounts whenever a
  // takeover page owns the keyboard, so nothing bleeds into compose inputs.
  const [selected, setSelected] = useState(0)
  // Keystrokes can coalesce into one stdin chunk over SSH, so j and y may
  // both fire before a re-render — the ref keeps the yank reading the row
  // the j actually landed on (same batch gotcha as the console's paste path).
  const selectedRef = useRef(selected)
  const [copied, setCopied] = useState<Copied>(null)

  // Left column needs ~36 cols (2-col selection gutter + 12-pad label +
  // longest value) plus a gap; vertically: Label + blank + QR rows + caption.
  const showQr = width >= QR_WIDTH + 41 && height >= QR_HEIGHT + 3

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

  // OSC 52 rides the same output stream as the frames, so the yank reaches
  // the *client's* clipboard even over SSH.
  const copy = (idx: number | "all") => {
    const text =
      idx === "all"
        ? rows.map(([label, , copyValue]) => `${label}: ${copyValue}`).join("\n")
        : rows[idx]![2]
    const ok = renderer.copyToClipboardOSC52(text)
    setCopied({ idx, ok })
  }

  useEffect(() => {
    if (!copied) return
    // one Bun process serves all SSH sessions — a leaked timer would keep
    // firing setState after disconnect, so always clean up
    const timer = setTimeout(() => setCopied(null), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const moveSelection = (delta: number) => {
    selectedRef.current = Math.max(0, Math.min(rows.length - 1, selectedRef.current + delta))
    setSelected(selectedRef.current)
  }

  useKeyboard((key) => {
    if (key.eventType === "release") return
    if (key.name === "j" || key.name === "down") {
      moveSelection(1)
    } else if (key.name === "k" || key.name === "up") {
      moveSelection(-1)
    } else if (key.name === "y" && key.shift) {
      copy("all")
    } else if (key.name === "y" || key.name === "return") {
      copy(selectedRef.current)
    }
  })

  const tagFor = (idx: number | "all") => {
    if (copied?.idx !== idx) return null
    return (
      <span fg={copied.ok ? theme.accent : theme.dim}>
        {copied.ok ? "  ■ COPIED" : "  ■ COPY UNSUPPORTED"}
      </span>
    )
  }

  return (
    <box flexDirection="column" width="100%">
      <Label text="N5 / Contact" />
      <text flexShrink={0}> </text>
      <box flexDirection="row" width="100%">
        <box flexDirection="column" flexGrow={1}>
          {rows.map(([label], i) => {
            const t = typed[i] ?? ""
            // Selection keeps the original text colors readable: an accent
            // edge mark + faint row tint instead of the full accent bar
            // (dim-on-accent failed contrast on every theme).
            return (
              <box
                key={label}
                flexDirection="row"
                width="100%"
                height={1}
                overflow="hidden"
                flexShrink={0}
                backgroundColor={i === selected ? theme.faint : undefined}
              >
                <text height={1} flexShrink={0} fg={theme.accent}>
                  {i === selected ? "▌ " : "  "}
                </text>
                <text height={1} flexShrink={0} fg={theme.fg}>
                  <span fg={theme.dim}>{t.slice(0, 12)}</span>
                  {t.slice(12)}
                  {i === activeLine ? <Cursor blink={false} /> : null}
                  {tagFor(i)}
                  {t.length === 0 ? " " : null}
                </text>
              </box>
            )
          })}
          <text flexShrink={0}> </text>
          <text height={1} flexShrink={0}>
            {"  "}
            <span fg={theme.accent}>{(typed[stayIdx] ?? "").slice(0, 2)}</span>
            <span fg={theme.dim}>{(typed[stayIdx] ?? "").slice(2)}</span>
            {stayIdx === activeLine ? <Cursor blink={false} /> : null}
            {tagFor("all")}
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
