import { useEffect, useMemo, useRef, useState } from "react"
import { TextAttributes, type InputRenderable } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import {
  bootLines,
  consoleRows,
  execute,
  INPUT_MAX,
  HISTORY_MAX,
  promptFor,
  type ConsoleEntry,
  type ConsoleSession,
  type OutStyle,
} from "../console"
import { identity } from "../content"
import { useTheme, type ThemeName } from "../theme"
import { usePresence } from "../hooks/usePresence"
import { useTypewriter } from "../hooks/useTypewriter"
import { wrapText } from "../util"
import { Rule } from "./Rule"
import { StatusBar } from "./StatusBar"

// The hidden console takeover: ` swaps the entire frame for a guest shell
// (same pattern as the CV and guestbook). Scrollback, history, and cwd live
// in App state so they survive close/reopen for the whole SSH session; the
// input buffer and scroll position are local and reset each open. The prompt
// is an UNCONTROLLED OpenTUI <input> — see GuestbookPage for why React state
// only mirrors its value and why the submit work happens in an effect.
type PromptState = { value: string; submit: boolean }

type PhysLine = { text: string; style?: OutStyle }

const EMPTY: string[] = []

function flatten(entries: ConsoleEntry[], width: number): PhysLine[] {
  const out: PhysLine[] = []
  for (const e of entries) {
    if (e.kind === "input") {
      for (const l of wrapText(e.text, width)) out.push({ text: l, style: "dim" })
    } else {
      for (const ol of e.lines)
        for (const l of wrapText(ol.text, width)) out.push({ text: l, style: ol.style })
    }
  }
  return out
}

export function ConsolePage({
  ip,
  visitorNumber,
  width,
  height,
  session,
  onSession,
  onClose,
  onTheme,
}: {
  ip: string
  visitorNumber: number
  width: number
  height: number
  session: ConsoleSession
  onSession: (update: (s: ConsoleSession) => ConsoleSession) => void
  onClose: () => void
  onTheme: (name: ThemeName) => void
}) {
  const theme = useTheme()
  const online = usePresence()
  const [st, setSt] = useState<PromptState>({ value: "", submit: false })
  const [scrollUp, setScrollUp] = useState(0) // lines from the BOTTOM; 0 = pinned to newest
  const inputRef = useRef<InputRenderable>(null)
  // A pasted string arrives as ONE synchronous batch of key events, so the
  // keyboard handler's render closure sees pre-batch state the whole way
  // through. Anything it must read mid-batch lives in refs instead: the
  // input's live value (onInput fires synchronously per key, after the
  // global handler) and the history-walk position, which is never rendered.
  const liveValue = useRef("")
  const histNav = useRef<{ idx: number | null; draft: string }>({ idx: null, draft: "" })
  // Latched at mount: only the very first open of the session animates.
  const firstOpen = useRef(!session.booted).current

  // Seed the boot banner once per SSH session; `clear` never resets `booted`,
  // so the banner never replays.
  useEffect(() => {
    if (session.booted) return
    onSession((s) =>
      s.booted ? s : { ...s, booted: true, entries: [{ kind: "output", lines: bootLines() }] },
    )
  }, [])

  const prompt = promptFor(session.cwd)
  // Entries store unwrapped text, so a resize re-wraps the whole scrollback.
  const physical = useMemo(() => flatten(session.entries, width), [session.entries, width])

  const rows = consoleRows(height)
  const maxUp = Math.max(0, physical.length - rows)
  const up = Math.min(scrollUp, maxUp) // clamp so a resize never scrolls past the top
  const start = Math.max(0, physical.length - rows - up)
  const visible = physical.slice(start, start + rows)

  // Boot animation. Any submitted command or scroll snaps it complete; on
  // reopens the line array is empty so the hook is done immediately and its
  // interval never starts.
  const inputCount = session.entries.reduce((n, e) => n + (e.kind === "input" ? 1 : 0), 0)
  const tw = useTypewriter(
    firstOpen ? physical.map((l) => l.text) : EMPTY,
    0,
    `${inputCount}:${up}`,
  )
  const animating = firstOpen && !tw.done

  // Command execution lives here, not in onSubmit: that callback closes over
  // render-time state, stale while a batch of input events commits (same
  // reasoning as the guestbook's submit effect).
  useEffect(() => {
    if (!st.submit) return
    const raw = st.value
    const trimmed = raw.trim()
    const echo: ConsoleEntry = { kind: "input", text: `${prompt} ${raw}`.trimEnd() }
    const res = trimmed
      ? execute(trimmed, {
          ip,
          visitorNumber,
          online,
          cwd: session.cwd,
          history: session.history,
          theme: theme.name,
        })
      : null
    onSession((s) => {
      const entries =
        res?.effect === "clear"
          ? []
          : [
              ...s.entries,
              echo,
              ...(res && res.lines.length > 0
                ? [{ kind: "output", lines: res.lines } as ConsoleEntry]
                : []),
            ]
      const history =
        trimmed && trimmed !== s.history[s.history.length - 1]
          ? [...s.history, trimmed].slice(-HISTORY_MAX)
          : s.history
      return { ...s, entries, history, cwd: res?.cwd ?? s.cwd }
    })
    if (inputRef.current) inputRef.current.value = "" // setter re-emits input, re-syncing the mirror
    liveValue.current = ""
    histNav.current = { idx: null, draft: "" }
    setSt({ value: "", submit: false })
    setScrollUp(0) // new output pins the window back to the bottom
    if (res?.theme) onTheme(res.theme)
    if (res?.effect === "exit") onClose() // the logout line lands in persisted scrollback first
  }, [st.submit])

  // Walk the persisted history: up saves the in-progress draft, down past the
  // newest entry restores it. Writing the input's value emits `input`, which
  // re-syncs liveValue and the mirrored state without extra plumbing.
  const recall = (dir: -1 | 1) => {
    const hist = session.history
    const nav = histNav.current
    if (hist.length === 0) return
    if (dir === -1) {
      const idx = nav.idx === null ? hist.length - 1 : Math.max(0, nav.idx - 1)
      histNav.current = { idx, draft: nav.idx === null ? liveValue.current : nav.draft }
      if (inputRef.current) inputRef.current.value = hist[idx]!
    } else {
      if (nav.idx === null) return
      if (nav.idx >= hist.length - 1) {
        histNav.current = { idx: null, draft: "" }
        if (inputRef.current) inputRef.current.value = nav.draft
      } else {
        histNav.current = { ...nav, idx: nav.idx + 1 }
        if (inputRef.current) inputRef.current.value = hist[nav.idx + 1]!
      }
    }
  }

  useKeyboard((key) => {
    if (key.eventType === "release") return
    if (key.name === "escape") return onClose()
    // Backtick closes only on an empty prompt — with text in the buffer it
    // types a literal ` (so pasting "echo `x`" works). liveValue, not
    // st.value: the render closure is stale for every key after the first
    // in a pasted batch.
    if (key.name === "`" && liveValue.current === "") {
      key.preventDefault()
      return onClose()
    }
    if (key.ctrl && key.name === "c") {
      // Shell-authentic ^C: echo the abandoned line, never kill the session —
      // esc, `, ctrl+d, and `exit` all still get you out.
      key.preventDefault()
      const echo: ConsoleEntry = { kind: "input", text: `${prompt} ${liveValue.current}^C` }
      onSession((s) => ({ ...s, entries: [...s.entries, echo] }))
      if (inputRef.current) inputRef.current.value = ""
      liveValue.current = ""
      histNav.current = { idx: null, draft: "" }
      setSt({ value: "", submit: false })
      setScrollUp(0)
      return
    }
    // EOF closes like a real shell; preventDefault because ctrl+d is
    // delete-char in the input's default keymap.
    if (key.ctrl && key.name === "d" && liveValue.current === "") {
      key.preventDefault()
      return onClose()
    }
    // Plain up/down recall history; pgup/pgdn (and shift+arrows) scroll the
    // window. NOT ctrl+u/d — those are line-editing ops in the input.
    if (key.name === "up" && !key.shift) {
      key.preventDefault()
      return recall(-1)
    }
    if (key.name === "down" && !key.shift) {
      key.preventDefault()
      return recall(1)
    }
    if (key.name === "pageup" || (key.shift && key.name === "up")) {
      key.preventDefault()
      setScrollUp((u) => Math.min(maxUp, u + Math.max(1, rows - 1)))
      return
    }
    if (key.name === "pagedown" || (key.shift && key.name === "down")) {
      key.preventDefault()
      setScrollUp((u) => Math.max(0, u - Math.max(1, rows - 1)))
      return
    }
    // Printable-ASCII-only policy, verbatim from the guestbook compose filter
    // (see GuestbookPage for why only insertable sequences are blocked).
    const seq = key.sequence
    if (typeof seq === "string" && seq.length > 0) {
      const first = seq.charCodeAt(0)
      if (first >= 0x20 && first !== 0x7f && /[^\x20-\x7E]/.test(seq)) key.preventDefault()
    }
  })

  const styleColor = (style?: OutStyle) =>
    style === "dim"
      ? theme.dim
      : style === "accent" || style === "error"
        ? theme.accent
        : theme.fg

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexDirection="row" width="100%" height={1} flexShrink={0}>
        <text flexShrink={1} fg={theme.fg} attributes={TextAttributes.BOLD}>
          CONSOLE
        </text>
        <text flexShrink={0} fg={theme.accent}>
          {" "}
          ✱
        </text>
        <box flexGrow={1} minWidth={1} />
        <text flexShrink={0} fg={theme.dim}>
          GUEST SHELL
        </text>
      </box>
      <Rule heavy width={width} />
      <text flexShrink={0} fg={theme.dim}>
        {start > 0 ? "↑ MORE" : " "}
      </text>
      {visible.map((line, i) => {
        const text = animating ? (tw.lines[start + i] ?? "") : line.text
        return (
          <text key={start + i} flexShrink={0} fg={styleColor(line.style)}>
            {text || " "}
          </text>
        )
      })}
      <box flexGrow={1} />
      <box flexDirection="row" width="100%" height={1} flexShrink={0}>
        <text flexShrink={0} fg={theme.accent}>
          {prompt}{" "}
        </text>
        <input
          ref={inputRef}
          flexGrow={1}
          focused
          maxLength={INPUT_MAX}
          textColor={theme.fg}
          focusedTextColor={theme.fg}
          cursorColor={theme.accent}
          onInput={(v) => {
            liveValue.current = v
            setSt((s) => (s.submit ? s : { ...s, value: v }))
          }}
          onSubmit={() => setSt((s) => (s.submit ? s : { ...s, submit: true }))}
        />
      </box>
      <Rule width={width} />
      <StatusBar
        hints={[
          { key: "enter", label: "run" },
          { key: "↑/↓", label: "history" },
          { key: "pgup/pgdn", label: "scroll" },
          { key: "esc", label: "close" },
        ]}
        right={`${identity.banner}.sh ✱`}
      />
    </box>
  )
}
