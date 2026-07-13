import { useEffect, useMemo, useState } from "react"
import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import { getStore, MSG_MAX, NAME_MAX, type GuestbookEntry } from "../../db"
import { identity } from "../content"
import { buildGuestbookLines, gbRows, type GbLine } from "../guestbook"
import { useTheme } from "../theme"
import { wrapText } from "../util"
import { Cursor } from "./Cursor"
import { Label } from "./Label"
import { Rule } from "./Rule"
import { StatusBar } from "./StatusBar"

// Compose form state lives in ONE object updated functionally: pasted or
// coalesced input delivers many key events in a single React batch, and
// per-key setState against the render closure would land every char in
// whichever field the last COMMITTED state had (enter's field switch included).
// A reducer-style updater sees the accumulated state for each event instead.
type ComposeState = { field: "name" | "message"; name: string; msg: string; submit: boolean }

function reduceComposeKey(
  c: ComposeState,
  key: { name: string; sequence?: string; ctrl?: boolean; meta?: boolean },
): ComposeState {
  if (c.submit) return c // a submit is in flight; ignore trailing input
  if (key.name === "return") {
    if (c.field === "name") return { ...c, field: "message" }
    return c.msg.trim() ? { ...c, submit: true } : c
  }
  if (key.name === "tab") return { ...c, field: c.field === "name" ? "message" : "name" }
  if (key.name === "backspace") {
    return c.field === "name" ? { ...c, name: c.name.slice(0, -1) } : { ...c, msg: c.msg.slice(0, -1) }
  }
  // printable ASCII only, one char at a time — escape sequences, paste
  // markers, and unicode never make it into the buffer (db.ts sanitizes
  // again before the row lands)
  const seq = key.sequence
  if (key.ctrl || key.meta || typeof seq !== "string" || seq.length !== 1) return c
  if (seq < "\x20" || seq > "\x7E") return c
  if (c.field === "name") return c.name.length < NAME_MAX ? { ...c, name: c.name + seq } : c
  return c.msg.length < MSG_MAX ? { ...c, msg: c.msg + seq } : c
}

// The guestbook takeover: `b` swaps the entire frame for this page (same
// pattern as the CV — a 6th tab doesn't fit the tab bar at min width). Unlike
// the CV, this page owns the keyboard entirely: in compose mode `q` and
// digits are text, so App's handler must not see any keys while we're open.
export function GuestbookPage({
  ip,
  width,
  height,
  onClose,
  onExit,
  onToggleTheme,
}: {
  ip: string
  width: number
  height: number
  onClose: () => void
  onExit: () => void
  onToggleTheme: () => void
}) {
  const theme = useTheme()
  const store = getStore()
  // Component remounts on every open (conditional render in App), so state
  // initializers double as the on-open read — other sessions' entries appear
  // the next time anyone opens the page.
  const [entries, setEntries] = useState<GuestbookEntry[]>(() => store.listGuestbook())
  const [total, setTotal] = useState(() => store.totalVisits())
  const [scroll, setScroll] = useState(0)
  // null = browse; see ComposeState above for why this is a single object
  const [compose, setCompose] = useState<ComposeState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const lines = useMemo(() => buildGuestbookLines(entries, width), [entries, width])
  const rows = gbRows(height)
  const maxScroll = Math.max(0, lines.length - rows)

  // The DB write happens here, not in the key handler: the handler only sees
  // render-time buffers, which are stale while a batch of key events commits.
  useEffect(() => {
    if (!compose?.submit) return
    const result = store.addEntry(ip, compose.name, compose.msg)
    if (result.ok) {
      setEntries(store.listGuestbook())
      setTotal(store.totalVisits())
      setCompose(null)
      setScroll(0)
      setError(null)
    } else {
      setError(
        result.reason === "rate_limited"
          ? `RATE LIMITED — TRY AGAIN IN ~${Math.max(1, Math.ceil(result.retryAfterSec / 60))} MIN`
          : "MESSAGE CANNOT BE EMPTY",
      )
      setCompose((c) => (c ? { ...c, submit: false } : c))
    }
  }, [compose?.submit])

  useKeyboard((key) => {
    if (key.eventType === "release") return

    if (compose) {
      if (key.ctrl && key.name === "c") return onExit()
      if (key.name === "escape") {
        setCompose(null)
        setError(null)
        return
      }
      setCompose((c) => (c ? reduceComposeKey(c, key) : c))
      return
    }

    // browse
    if (key.name === "q" || (key.ctrl && key.name === "c")) return onExit()
    if (key.name === "escape" || key.name === "backspace" || key.name === "b") return onClose()
    if (key.name === "n" || key.name === "return") {
      setCompose({ field: "name", name: "", msg: "", submit: false })
      setError(null)
      return
    }
    if (key.name === "t") return onToggleTheme()
    if (key.name === "j" || key.name === "down") setScroll((s) => Math.min(maxScroll, s + 1))
    else if (key.name === "k" || key.name === "up") setScroll((s) => Math.max(0, s - 1))
    else if (key.name === "g" && key.shift) setScroll(maxScroll)
    else if (key.name === "g") setScroll(0)
  })

  const renderLine = (line: GbLine, key: number) => {
    switch (line.kind) {
      case "blank":
        return (
          <text key={key} flexShrink={0}>
            {" "}
          </text>
        )
      case "meta":
        return (
          <text key={key} flexShrink={0}>
            <span fg={theme.accent}>✱ </span>
            <span fg={theme.fg}>{line.name.toUpperCase()}</span>
            <span fg={theme.dim}> · {line.date}</span>
          </text>
        )
      case "text":
        return (
          <text key={key} flexShrink={0} fg={theme.fg}>
            {"  " + line.text}
          </text>
        )
      case "empty":
        return (
          <text key={key} flexShrink={0} fg={theme.dim}>
            NO ENTRIES YET — PRESS N TO SIGN.END
          </text>
        )
      case "end":
        return (
          <box key={key} flexDirection="row" width="100%" height={1} justifyContent="center">
            <text flexShrink={0}>
              <span fg={theme.accent}>✱ </span>
              <span fg={theme.dim}>END OF GUESTBOOK</span>
            </text>
          </box>
        )
    }
  }

  // Buffers can outgrow one row (message is 120 chars, min frame is 64 wide);
  // wrap them here like every other fixed layout in the app.
  const renderField = (buf: string, active: boolean) => {
    const fieldLines = wrapText(buf, width - 2)
    return fieldLines.map((line, i) => (
      <text key={i} flexShrink={0} fg={theme.fg}>
        {line || (active ? "" : " ")}
        {active && i === fieldLines.length - 1 ? <Cursor /> : null}
      </text>
    ))
  }

  const offset = Math.min(scroll, maxScroll)
  const visible = lines.slice(offset, offset + rows)
  const below = lines.length - offset - visible.length

  const hints = !compose
    ? [
        { key: "n", label: "sign" },
        { key: "j/k", label: "scroll" },
        { key: "esc", label: "back" },
        { key: "t", label: "theme" },
        { key: "q", label: "quit" },
      ]
    : [
        { key: "enter", label: compose.field === "name" ? "next" : "send" },
        { key: "tab", label: "field" },
        { key: "esc", label: "cancel" },
      ]

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexDirection="row" width="100%" height={1} flexShrink={0}>
        <text flexShrink={1} fg={theme.fg} attributes={TextAttributes.BOLD}>
          GUESTBOOK
        </text>
        <text flexShrink={0} fg={theme.accent}>
          {" "}
          ✱
        </text>
        <box flexGrow={1} minWidth={1} />
        <text flexShrink={0} fg={theme.dim}>
          N{String(total).padStart(4, "0")} VISITS
        </text>
      </box>
      <Rule heavy width={width} />
      {!compose ? (
        <>
          <text flexShrink={0} fg={theme.dim}>
            {offset > 0 ? "↑ MORE" : " "}
          </text>
          {visible.map((line, i) => renderLine(line, offset + i))}
          <text flexShrink={0} fg={theme.dim}>
            {below > 0 ? `↓ +${below} MORE` : " "}
          </text>
        </>
      ) : (
        <box flexDirection="column" paddingTop={1} overflow="hidden">
          <Label text="Name (optional)" accent={compose.field === "name"} />
          {renderField(compose.name, compose.field === "name")}
          <text flexShrink={0}> </text>
          <box flexDirection="row" width="100%" height={1} flexShrink={0}>
            <Label text="Message" accent={compose.field === "message"} />
            <box flexGrow={1} minWidth={1} />
            <text flexShrink={0} fg={theme.dim}>
              {compose.msg.length}/{MSG_MAX}
            </text>
          </box>
          {renderField(compose.msg, compose.field === "message")}
          <text flexShrink={0}> </text>
          <text flexShrink={0} fg={theme.accent}>
            {error ?? " "}
          </text>
        </box>
      )}
      <box flexGrow={1} />
      <Rule width={width} />
      <StatusBar hints={hints} right={`${identity.banner}.gb ✱`} />
    </box>
  )
}
