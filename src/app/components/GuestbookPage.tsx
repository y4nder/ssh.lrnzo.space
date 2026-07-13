import { useEffect, useMemo, useRef, useState } from "react"
import { TextAttributes, type InputRenderable } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import { getStore, MSG_MAX, NAME_MAX, type GuestbookEntry } from "../../db"
import { identity } from "../content"
import { buildGuestbookLines, gbRows, type GbLine } from "../guestbook"
import { useTheme } from "../theme"
import { Label } from "./Label"
import { Rule } from "./Rule"
import { StatusBar } from "./StatusBar"

// The compose fields are UNCONTROLLED OpenTUI <input> renderables: they own
// the buffer, cursor, and editing keys (arrows, home/end, word ops, undo).
// React state only mirrors their values via onInput — for the char counter
// and for the submit effect below — in one object updated functionally, so
// a batch of events (paste, fast typing, enter) sees accumulated state
// instead of the stale render closure.
type ComposeState = { field: "name" | "message"; name: string; msg: string; submit: boolean }

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
  const msgInputRef = useRef<InputRenderable>(null)

  const lines = useMemo(() => buildGuestbookLines(entries, width), [entries, width])
  const rows = gbRows(height)
  const maxScroll = Math.max(0, lines.length - rows)

  // The DB write happens here, not in the inputs' onSubmit: that callback
  // closes over render-time state, which is stale while a batch of input
  // events commits. This effect reads the fully committed compose state.
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
      if (key.name === "tab") {
        setCompose((c) => (c ? { ...c, field: c.field === "name" ? "message" : "name" } : c))
        return
      }
      // Printable-ASCII-only policy (db.ts sanitizes again before the row
      // lands): global keypress listeners run BEFORE the focused input's
      // handler, so preventDefault here keeps unicode out of its buffer.
      // Only block sequences the input would INSERT as text — its insert
      // guard takes first char >= \x20 and != \x7f. Everything outside that
      // is a named key the input must still see: arrows/delete/home start
      // with \x1b, backspace is the bare DEL byte \x7f.
      const seq = key.sequence
      if (typeof seq === "string" && seq.length > 0) {
        const first = seq.charCodeAt(0)
        if (first >= 0x20 && first !== 0x7f && /[^\x20-\x7E]/.test(seq)) key.preventDefault()
      }
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
          <input
            width="100%"
            flexShrink={0}
            focused={compose.field === "name"}
            maxLength={NAME_MAX}
            textColor={theme.fg}
            focusedTextColor={theme.fg}
            cursorColor={theme.accent}
            placeholder="ANONYMOUS"
            placeholderColor={theme.faint}
            onInput={(v) => setCompose((c) => (c && !c.submit ? { ...c, name: v } : c))}
            onSubmit={() => {
              // Hand focus over IMPERATIVELY, not via the focused prop: a
              // pasted "name\rmessage" arrives as one synchronous batch of
              // key events, and React won't re-render (flip focused props)
              // until the whole batch is processed — by which time every
              // message char would have landed in this field. focus() blurs
              // the name input in the same tick, so the very next key event
              // already goes to the message input. The state update below
              // then flips the focused props to match (both become no-ops).
              msgInputRef.current?.focus()
              setCompose((c) => (c ? { ...c, field: "message" } : c))
            }}
          />
          <text flexShrink={0}> </text>
          <box flexDirection="row" width="100%" height={1} flexShrink={0}>
            <Label text="Message" accent={compose.field === "message"} />
            <box flexGrow={1} minWidth={1} />
            <text flexShrink={0} fg={theme.dim}>
              {compose.msg.length}/{MSG_MAX}
            </text>
          </box>
          <input
            ref={msgInputRef}
            width="100%"
            flexShrink={0}
            focused={compose.field === "message"}
            maxLength={MSG_MAX}
            textColor={theme.fg}
            focusedTextColor={theme.fg}
            cursorColor={theme.accent}
            onInput={(v) => setCompose((c) => (c && !c.submit ? { ...c, msg: v } : c))}
            onSubmit={() =>
              setCompose((c) => (c && !c.submit && c.msg.trim() ? { ...c, submit: true } : c))
            }
          />
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
