import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import { useMemo, useState } from "react"
import { ensureBody, isEnabled, type BodyState, type PostSummary } from "../../blog"
import { identity } from "../content"
import { useBlogBody, useBlogIndex } from "../hooks/useBlog"
import { useStreamReveal } from "../hooks/useStreamReveal"
import { useTypewriter } from "../hooks/useTypewriter"
import { sliceTokens, type Token, type TokenStyle } from "../markdown"
import { buildPostLines, postLineLength, postRowParts, postRows, END_MARK, type PostLine } from "../post"
import { useTheme, type Theme } from "../theme"
import { fitLines } from "../util"
import { Cursor } from "./Cursor"
import { Rule } from "./Rule"
import { SelectableList } from "./SelectableList"
import { StatusBar } from "./StatusBar"

// The `l` takeover: the writing from lrnzo.space/log, read in the terminal.
//
// Two modes in one component — the index, and the reader. They share a masthead
// and a status bar, and `esc` walks back out one level at a time rather than
// dropping straight to the app, so a misfire in the reader doesn't cost you
// your place in the list.
//
// READ-ONLY, all the way down. This page can fetch two public GET routes and
// nothing else; see the header of blog.ts.
//
// theme.faint is never used for text here. It is a structural token meant for
// placeholder fill and is invisible on a dark terminal (see MusicPage.tsx:38).

/** Rows outside the list: masthead + heavy rule + bottom rule + status bar. */
const INDEX_CHROME = 4
/** Below this, the frame has no room for a preview under the list. */
const PREVIEW_MIN_ROWS = 12

const EMPTY: PostSummary[] = []

export function BlogPage({
  width,
  height,
  onClose,
  onExit,
  onToggleTheme,
}: {
  width: number
  height: number
  onClose: () => void
  onExit: () => void
  onToggleTheme: () => void
}) {
  const theme = useTheme()
  const index = useBlogIndex()
  const [cursor, setCursor] = useState(0)
  const [openSlug, setOpenSlug] = useState<string | null>(null)
  const [scroll, setScroll] = useState(0)

  const posts = index.status === "ready" ? index.posts : EMPTY
  const selected = Math.min(cursor, Math.max(0, posts.length - 1))
  const body = useBlogBody(openSlug)
  const post = body?.status === "ready" ? body.post : null

  // Rebuilds only when the post or the frame width changes, which is what lets
  // width double as the reveal's resetKey below.
  const lines = useMemo(() => (post ? buildPostLines(post, width) : []), [post, width])
  const rows = postRows(height)
  const maxScroll = Math.max(0, lines.length - rows)

  const close = () => {
    setOpenSlug(null)
    setScroll(0)
  }

  useKeyboard((key) => {
    if (key.eventType === "release") return
    // `q` quits the session on every page in this app.
    if (key.name === "q" || (key.ctrl && key.name === "c")) return onExit()
    if (key.name === "t") return onToggleTheme()

    if (openSlug !== null) {
      if (key.name === "escape" || key.name === "backspace" || key.name === "l") return close()
      if (key.name === "j" || key.name === "down") return setScroll((s) => Math.min(maxScroll, s + 1))
      if (key.name === "k" || key.name === "up") return setScroll((s) => Math.max(0, s - 1))
      if (key.name === "g" && key.shift) return setScroll(maxScroll)
      if (key.name === "g") return setScroll(0)
      return
    }

    if (key.name === "escape" || key.name === "backspace" || key.name === "l") return onClose()
    if (key.name === "j" || key.name === "down")
      return setCursor((c) => Math.min(Math.max(0, posts.length - 1), c + 1))
    if (key.name === "k" || key.name === "up") return setCursor((c) => Math.max(0, c - 1))
    if (key.name === "g" && key.shift) return setCursor(Math.max(0, posts.length - 1))
    if (key.name === "g") return setCursor(0)
    if (key.name === "return" || key.name === "enter") {
      const target = posts[selected]
      if (!target) return
      ensureBody(target.slug)
      setScroll(0)
      setOpenSlug(target.slug)
    }
  })

  const reading = openSlug !== null
  const hints = reading
    ? [
        { key: "esc", label: "index" },
        { key: "j/k", label: "scroll" },
        { key: "t", label: "theme" },
        { key: "q", label: "quit" },
      ]
    : [
        // Nothing to select on an empty, loading, or unreachable log — offering
        // the keys anyway would be advertising something that does nothing.
        ...(posts.length > 0
          ? [
              { key: "↵", label: "read" },
              { key: "j/k", label: "select" },
            ]
          : []),
        { key: "esc", label: "back" },
        { key: "t", label: "theme" },
        { key: "q", label: "quit" },
      ]

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexDirection="row" width="100%" height={1} flexShrink={0}>
        <text flexShrink={1} fg={theme.fg} attributes={TextAttributes.BOLD}>
          THE LOG
        </text>
        <text flexShrink={0} fg={theme.accent}> ✱</text>
        <box flexGrow={1} minWidth={1} />
        <text flexShrink={0} fg={theme.dim}>
          {reading ? "ENTRY" : posts.length > 0 ? `${posts.length} ${posts.length === 1 ? "ENTRY" : "ENTRIES"}` : ""}
        </text>
      </box>

      <Rule heavy width={width} />

      {reading ? (
        <Reader lines={lines} rows={rows} scroll={scroll} width={width} state={body} theme={theme} />
      ) : (
        <Index posts={posts} selected={selected} width={width} height={height} status={index.status} theme={theme} />
      )}

      <Rule width={width} />
      <StatusBar hints={hints} right={`${identity.banner}.log ✱`} />
    </box>
  )
}

// ---- INDEX -----------------------------------------------------------------

function Index({
  posts,
  selected,
  width,
  height,
  status,
  theme,
}: {
  posts: PostSummary[]
  selected: number
  width: number
  height: number
  status: "idle" | "loading" | "ready" | "error"
  theme: Theme
}) {
  const avail = Math.max(1, height - INDEX_CHROME)
  const showPreview = avail >= PREVIEW_MIN_ROWS && posts.length > 0
  // 1 row for the rule between list and preview.
  const previewRows = showPreview ? Math.min(6, Math.max(3, Math.floor(avail / 3))) : 0
  const listArea = Math.max(1, avail - previewRows - (showPreview ? 1 : 0))
  // SelectableList spends two extra rows on its ↑/↓ indicators when it overflows.
  const visible = posts.length > listArea ? Math.max(1, listArea - 2) : posts.length

  const current = posts[selected]
  const { lines: fitted } = fitLines(current ? [current.dek] : [], width, Math.max(1, previewRows - 1))
  const { lines: typed, activeLine } = useTypewriter(fitted, selected)

  if (posts.length === 0) return <Notice theme={theme} text={emptyText(status)} />

  return (
    <>
      <SelectableList
        count={posts.length}
        selected={selected}
        visible={visible}
        renderRow={(i, isSelected) => {
          const { left, right } = postRowParts(posts[i]!, width - 2)
          return (
            <>
              <text
                flexGrow={1}
                flexShrink={1}
                height={1}
                fg={isSelected ? theme.barFg : theme.fg}
                attributes={isSelected ? TextAttributes.BOLD : undefined}
              >
                {" "}
                {left}
              </text>
              <text flexShrink={0} height={1} fg={isSelected ? theme.barFg : theme.dim}>
                {right.toUpperCase()}{" "}
              </text>
            </>
          )
        }}
      />
      {showPreview ? (
        <>
          <Rule width={width} />
          {fitted.map((line, i) => {
            const t = typed[i] ?? ""
            return (
              <text key={i} height={1} flexShrink={0} fg={theme.dim}>
                {t || " "}
                {i === activeLine ? <Cursor blink={false} /> : null}
              </text>
            )
          })}
        </>
      ) : null}
      <box flexGrow={1} minHeight={0} />
    </>
  )
}

function emptyText(status: "idle" | "loading" | "ready" | "error"): string {
  // Four honest states. "No entries" and "can't reach the API" are different
  // facts and a reader deserves to know which one they're looking at.
  if (!isEnabled()) return "LOG OFFLINE"
  if (status === "error") return "LOG UNREACHABLE"
  if (status === "ready") return "NO ENTRIES YET"
  return "LOADING…"
}

function Notice({ theme, text }: { theme: Theme; text: string }) {
  return (
    <box flexGrow={1} justifyContent="center" alignItems="center">
      <text fg={theme.dim}>{text}</text>
    </box>
  )
}

// ---- READER ----------------------------------------------------------------

function Reader({
  lines,
  rows,
  scroll,
  width,
  state,
  theme,
}: {
  lines: PostLine[]
  rows: number
  scroll: number
  width: number
  state: BodyState | undefined
  theme: Theme
}) {
  // Clamp against the current window so a resize never scrolls past the end.
  const offset = Math.min(scroll, Math.max(0, lines.length - rows))
  const visible = lines.slice(offset, offset + rows)
  const below = lines.length - offset - visible.length

  const lengths = useMemo(() => lines.map((l) => postLineLength(l, width)), [lines, width])
  // `lines` only rebuilds when the post or the frame width changes, so width
  // doubles as the resetKey: a re-wrap latches instead of retyping.
  const { shownFor, activeLine } = useStreamReveal(lengths, offset, offset + visible.length, width)

  if (lines.length === 0) {
    const text =
      state?.status === "error" ? (state.notFound ? "ENTRY NOT FOUND" : "ENTRY UNREACHABLE") : "LOADING…"
    return <Notice theme={theme} text={text} />
  }

  return (
    <>
      <text flexShrink={0} fg={theme.dim}>
        {offset > 0 ? "↑ MORE" : " "}
      </text>
      {visible.map((line, i) => (
        <Row
          key={offset + i}
          line={line}
          width={width}
          shown={shownFor(offset + i)}
          cursor={offset + i === activeLine}
          theme={theme}
        />
      ))}
      <text flexShrink={0} fg={theme.dim}>
        {below > 0 ? `↓ +${below} MORE` : " "}
      </text>
      <box flexGrow={1} minHeight={0} />
    </>
  )
}

/**
 * One rendered row.
 *
 * Every branch must consume exactly the character budget postLineLength()
 * declares for that kind — the reveal counts characters, not tokens, and a
 * branch that draws a prefix the length function doesn't know about will run
 * the cursor off the end of its line.
 */
function Row({
  line,
  width,
  shown,
  cursor,
  theme,
}: {
  line: PostLine
  width: number
  shown: number
  cursor: boolean
  theme: Theme
}) {
  const caret = cursor ? <Cursor blink={false} /> : null

  switch (line.kind) {
    case "blank":
      return <text flexShrink={0}> </text>
    case "rule":
      // Sweeps left to right; Rule floors at 1 char, hence the blank guard.
      return shown === 0 ? (
        <text height={1} flexShrink={0}>
          {" "}
        </text>
      ) : (
        <Rule width={shown} />
      )
    case "kicker":
      return (
        <text height={1} flexShrink={0} fg={theme.accent}>
          {line.text.slice(0, shown).toUpperCase() || " "}
          {caret}
        </text>
      )
    case "title":
      return (
        <text height={1} flexShrink={0} fg={theme.fg} attributes={TextAttributes.BOLD}>
          {line.text.slice(0, shown) || " "}
          {caret}
        </text>
      )
    case "dek":
      return (
        <text height={1} flexShrink={0} fg={theme.dim}>
          {line.text.slice(0, shown) || " "}
          {caret}
        </text>
      )
    case "tags":
      return (
        <text height={1} flexShrink={0} fg={theme.accent}>
          {line.text.slice(0, shown) || " "}
          {caret}
        </text>
      )
    case "caption": {
      const t = (line.prefix + line.text).slice(0, shown)
      return (
        <text height={1} flexShrink={0} fg={theme.dim}>
          {t || " "}
          {caret}
        </text>
      )
    }
    case "code": {
      const t = ("  " + line.text).slice(0, shown)
      return (
        <text height={1} flexShrink={0} fg={theme.accent}>
          {t || " "}
          {caret}
        </text>
      )
    }
    case "heading": {
      const shownTokens = sliceTokens(line.tokens, shown)
      // h1/h2 are the article's own structure and get the accent caps; deeper
      // levels stay in body colour so they don't outshout the sections above.
      const top = line.level <= 2
      return (
        <text height={1} flexShrink={0}>
          {shownTokens.length === 0 ? " " : null}
          {shownTokens.map((t, i) => (
            <span key={i} fg={top ? theme.accent : theme.fg} attributes={TextAttributes.BOLD}>
              {top ? t.text.toUpperCase() : t.text}
            </span>
          ))}
          {caret}
        </text>
      )
    }
    case "para":
      return (
        <text height={1} flexShrink={0}>
          <Spans tokens={sliceTokens(line.tokens, shown)} theme={theme} />
          {caret}
        </text>
      )
    case "bullet":
    case "quote": {
      const prefixShown = line.prefix.slice(0, shown)
      const rest = sliceTokens(line.tokens, Math.max(0, shown - line.prefix.length))
      return (
        <text height={1} flexShrink={0}>
          <span fg={theme.accent}>{prefixShown}</span>
          <Spans tokens={rest} theme={theme} dim={line.kind === "quote"} />
          {shown === 0 ? " " : null}
          {caret}
        </text>
      )
    }
    case "end": {
      const t = END_MARK.slice(0, shown)
      const pad = " ".repeat(Math.max(0, Math.floor((width - END_MARK.length) / 2)))
      return (
        <text height={1} flexShrink={0}>
          {pad || (t ? null : " ")}
          <span fg={theme.accent}>{t.slice(0, 2)}</span>
          <span fg={theme.dim}>{t.slice(2)}</span>
          {caret}
        </text>
      )
    }
  }
}

function Spans({ tokens, theme, dim = false }: { tokens: Token[]; theme: Theme; dim?: boolean }) {
  if (tokens.length === 0) return <span> </span>
  return (
    <>
      {tokens.map((t, i) => (
        <span key={i} fg={colorFor(t.style, theme, dim)} attributes={attrFor(t.style)}>
          {t.text}
        </span>
      ))}
    </>
  )
}

function colorFor(style: TokenStyle, theme: Theme, dim: boolean): string {
  if (style === "code" || style === "link") return theme.accent
  return dim ? theme.dim : theme.fg
}

function attrFor(style: TokenStyle): number | undefined {
  switch (style) {
    case "strong":
      return TextAttributes.BOLD
    case "em":
      return TextAttributes.ITALIC
    case "link":
      return TextAttributes.UNDERLINE
    default:
      return undefined
  }
}
