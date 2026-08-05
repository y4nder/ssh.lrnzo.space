// A GitHub-flavoured-markdown subset, parsed into styled tokens for the
// terminal. Posts arrive from api.lrnzo.space as raw GFM (the API's own words:
// "Rendered to HTML by the frontend at build time"), so the SSH client is the
// one consumer that has to do the rendering itself.
//
// Deliberately not a full CommonMark implementation. It handles what the corpus
// actually contains — ATX headings, blank-line paragraphs, emphasis, inline
// code, links, lists, blockquotes, fenced code, thematic breaks — and degrades
// anything else to plain text rather than throwing. A post must never be able
// to crash a session.
//
// The load-bearing reason tokens exist at all: wrapText in util.ts measures raw
// `.length`, so wrapping `*emphasis*` before stripping the asterisks would wrap
// two characters early on every emphasised line. Markers come off first, and
// the style rides alongside the text instead.

export type TokenStyle = "plain" | "em" | "strong" | "code" | "link"

export type Token = { text: string; style: TokenStyle }

export type Block =
  | { kind: "heading"; level: number; tokens: Token[] }
  | { kind: "para"; tokens: Token[] }
  | { kind: "bullet"; tokens: Token[]; marker: string }
  | { kind: "quote"; tokens: Token[] }
  | { kind: "code"; lines: string[]; lang: string }
  | { kind: "hr" }

// ---- INLINE ----------------------------------------------------------------

const WORD = /[A-Za-z0-9]/

function isWordChar(c: string | undefined): boolean {
  return c !== undefined && WORD.test(c)
}

/**
 * Merge runs of the same style so a line is a handful of tokens rather than one
 * per character. Purely a tidiness pass — nothing downstream depends on it, but
 * every consumer walks these arrays per frame.
 */
function coalesce(tokens: Token[]): Token[] {
  const out: Token[] = []
  for (const t of tokens) {
    if (t.text.length === 0) continue
    const last = out[out.length - 1]
    if (last && last.style === t.style) last.text += t.text
    else out.push({ text: t.text, style: t.style })
  }
  return out
}

/**
 * Scan a single logical line into styled tokens.
 *
 * Single pass, no regex backtracking, and every unmatched opener falls through
 * to a literal character — an unterminated `*` or backtick is far more likely to
 * be someone's prose than a formatting intent, and treating it as an error
 * would mean a stray asterisk could swallow the rest of a paragraph.
 */
export function parseInline(src: string): Token[] {
  const tokens: Token[] = []
  let plain = ""
  let i = 0

  const flush = () => {
    if (plain) {
      tokens.push({ text: plain, style: "plain" })
      plain = ""
    }
  }

  while (i < src.length) {
    const c = src[i]!

    // Backslash escape: the next character is always literal.
    if (c === "\\" && i + 1 < src.length) {
      plain += src[i + 1]
      i += 2
      continue
    }

    // Inline code. Runs of backticks match a run of the same length, so
    // ``a `b` c`` works. Code spans win over every other marker inside them.
    if (c === "`") {
      let fence = 0
      while (src[i + fence] === "`") fence++
      const close = src.indexOf("`".repeat(fence), i + fence)
      const runsOn = close !== -1 && src[close + fence] !== "`"
      if (runsOn) {
        flush()
        tokens.push({ text: src.slice(i + fence, close), style: "code" })
        i = close + fence
        continue
      }
      plain += "`".repeat(fence)
      i += fence
      continue
    }

    // Image: rendered as its alt text, since the terminal shows no pictures.
    // A decorative image (empty alt, per the API's own convention) vanishes.
    if (c === "!" && src[i + 1] === "[") {
      const parsed = linkAt(src, i + 1)
      if (parsed) {
        flush()
        if (parsed.label) tokens.push({ text: parsed.label, style: "link" })
        i = parsed.end
        continue
      }
    }

    // Link: keep the label, drop the URL. A terminal can't follow it, and the
    // raw href would cost more width than the sentence it interrupts.
    if (c === "[") {
      const parsed = linkAt(src, i)
      if (parsed) {
        flush()
        tokens.push({ text: parsed.label, style: "link" })
        i = parsed.end
        continue
      }
    }

    if (c === "*" || c === "_") {
      // Count the whole run so ***both*** matches its own three, rather than
      // opening a ** that closes against the first two of the closing three and
      // leaves a stray asterisk behind.
      let run = 0
      while (src[i + run] === c) run++
      const marker = c.repeat(Math.min(run, 3))
      // A token carries one attribute, so bold-italic has to pick: strong reads
      // as the stronger of the two in a terminal.
      const style: TokenStyle = marker.length === 1 ? "em" : "strong"
      const close = emphasisClose(src, i + marker.length, marker, c === "_")
      if (close !== -1) {
        flush()
        const inner = src.slice(i + marker.length, close)
        // Nested markers resolve recursively; the outer style wins on conflict,
        // which is the only sane collapse when there is one attribute per token.
        for (const t of parseInline(inner)) {
          tokens.push({ text: t.text, style: t.style === "plain" ? style : t.style })
        }
        i = close + marker.length
        continue
      }
    }

    plain += c
    i++
  }

  flush()
  return coalesce(tokens)
}

/** Parse `[label](url)` starting at `open`. Returns null if it isn't one. */
function linkAt(src: string, open: number): { label: string; end: number } | null {
  let depth = 0
  let i = open
  for (; i < src.length; i++) {
    const c = src[i]
    if (c === "\\") {
      i++
      continue
    }
    if (c === "[") depth++
    else if (c === "]") {
      depth--
      if (depth === 0) break
    }
  }
  if (depth !== 0 || src[i + 1] !== "(") return null
  const close = src.indexOf(")", i + 2)
  if (close === -1) return null
  // The label may carry its own emphasis; flatten it to text.
  const label = parseInline(src.slice(open + 1, i))
    .map((t) => t.text)
    .join("")
  return { label, end: close + 1 }
}

/**
 * Find the closing marker for emphasis opened at `from`, or -1.
 *
 * `_` is held to word boundaries so snake_case identifiers survive intact —
 * without it, `NOWPLAYING_URL and BLOG_URL` renders as one long emphasised run.
 * `*` has no such rule (it never appears mid-word in prose), but neither marker
 * may open on whitespace, which is what keeps a bare `*` in a sentence literal.
 */
function emphasisClose(src: string, from: number, marker: string, wordBounded: boolean): number {
  if (from >= src.length) return -1
  const opener = src[from]
  if (opener === " " || opener === undefined) return -1
  if (wordBounded && isWordChar(src[from - marker.length - 1])) return -1

  for (let i = from; i < src.length; i++) {
    if (src[i] === "\\") {
      i++
      continue
    }
    if (!src.startsWith(marker, i)) continue
    if (i === from) continue
    if (src[i - 1] === " ") continue
    // A longer run than we opened with belongs to a different marker.
    if (marker.length === 1 && src[i + 1] === marker) continue
    if (wordBounded && isWordChar(src[i + marker.length])) continue
    return i
  }
  return -1
}

// ---- BLOCKS ----------------------------------------------------------------

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([^\s`]*)/
const HR = /^\s{0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const QUOTE = /^\s{0,3}>\s?(.*)$/
const BULLET = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/
const SETEXT = /^\s{0,3}(=+|-+)\s*$/

function isBlockStart(line: string): boolean {
  return (
    line.trim() === "" ||
    FENCE.test(line) ||
    HR.test(line) ||
    HEADING.test(line) ||
    QUOTE.test(line) ||
    BULLET.test(line)
  )
}

/**
 * Split a post body into blocks. Never throws; anything unrecognised ends up in
 * a paragraph.
 */
export function parseMarkdown(body: string): Block[] {
  const lines = body.replace(/\r\n?/g, "\n").split("\n")
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!

    if (line.trim() === "") {
      i++
      continue
    }

    const fence = FENCE.exec(line)
    if (fence) {
      const close = fence[1]![0]!
      const lang = fence[2] ?? ""
      const closer = close === "`" ? /^\s{0,3}`{3,}\s*$/ : /^\s{0,3}~{3,}\s*$/
      const code: string[] = []
      i++
      while (i < lines.length && !closer.test(lines[i]!)) {
        code.push(lines[i]!)
        i++
      }
      // An unterminated fence runs to the end of the post rather than dropping
      // the rest of it on the floor.
      if (i < lines.length) i++
      blocks.push({ kind: "code", lines: code, lang })
      continue
    }

    // HR before BULLET: `- - -` matches both, and a thematic break is the
    // intent every time someone writes it.
    if (HR.test(line)) {
      blocks.push({ kind: "hr" })
      i++
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1]!.length, tokens: parseInline(heading[2]!) })
      i++
      continue
    }

    if (QUOTE.test(line)) {
      const parts: string[] = []
      while (i < lines.length) {
        const q = QUOTE.exec(lines[i]!)
        if (q) parts.push(q[1]!)
        else if (lines[i]!.trim() === "" || isBlockStart(lines[i]!)) break
        else parts.push(lines[i]!) // lazy continuation
        i++
      }
      blocks.push({ kind: "quote", tokens: parseInline(parts.join(" ").trim()) })
      continue
    }

    const bullet = BULLET.exec(line)
    if (bullet) {
      const parts = [bullet[3]!]
      i++
      // Continuation lines: indented, and not the start of something else.
      while (i < lines.length && lines[i]!.trim() !== "" && !isBlockStart(lines[i]!)) {
        parts.push(lines[i]!.trim())
        i++
      }
      blocks.push({ kind: "bullet", marker: bullet[2]!, tokens: parseInline(parts.join(" ")) })
      continue
    }

    // Paragraph: run to the next blank line or block start.
    const parts = [line]
    i++
    while (i < lines.length && lines[i]!.trim() !== "" && !isBlockStart(lines[i]!)) {
      // Setext underline promotes the paragraph so far into a heading.
      if (SETEXT.test(lines[i]!) && parts.length > 0) break
      parts.push(lines[i]!.trim())
      i++
    }
    const underline = i < lines.length ? SETEXT.exec(lines[i]!) : null
    if (underline) {
      i++
      blocks.push({
        kind: "heading",
        level: underline[1]!.startsWith("=") ? 1 : 2,
        tokens: parseInline(parts.join(" ").trim()),
      })
      continue
    }
    blocks.push({ kind: "para", tokens: parseInline(parts.join(" ").trim()) })
  }

  return blocks
}

// ---- MEASURING AND WRAPPING ------------------------------------------------

export function tokensText(tokens: Token[]): string {
  let s = ""
  for (const t of tokens) s += t.text
  return s
}

/**
 * The first `n` printable characters of a token line, styles intact.
 *
 * This is what makes the typewriter reveal work over styled text: useStreamReveal
 * hands back a plain character budget for the whole line, and the cut can land
 * in the middle of any token.
 */
export function sliceTokens(tokens: Token[], n: number): Token[] {
  if (n <= 0) return []
  const out: Token[] = []
  let left = n
  for (const t of tokens) {
    if (left <= 0) break
    out.push(left >= t.text.length ? t : { text: t.text.slice(0, left), style: t.style })
    left -= t.text.length
  }
  return out
}

/**
 * Greedy word wrap over styled tokens. Mirrors wrapText in util.ts — including
 * hard-breaking words longer than the width — but carries each word's style
 * through, so a `code` span that straddles a line break stays styled on both.
 *
 * GUARANTEE: no returned line exceeds `width`. The renderer draws each line as
 * a fixed height={1} row, and one overflowing row makes yoga shrink its
 * siblings to zero height and blank them (see util.ts:33).
 */
export function wrapTokens(tokens: Token[], width: number): Token[][] {
  if (width <= 0) return tokens.length > 0 ? [tokens] : [[]]

  const lines: Token[][] = []
  let line: Token[] = []
  let len = 0

  const push = (text: string, style: TokenStyle) => {
    const last = line[line.length - 1]
    if (last && last.style === style) last.text += text
    else line.push({ text, style })
    len += text.length
  }
  const brk = () => {
    lines.push(line)
    line = []
    len = 0
  }

  for (const atom of atomize(tokens)) {
    let word = atom.text
    // Longer than the frame: hard-break it rather than overflow the row.
    while (word.length > width) {
      if (len > 0) brk()
      push(word.slice(0, width), atom.style)
      brk()
      word = word.slice(width)
    }
    if (word === "") continue

    const sep = len > 0 && atom.space ? " " : ""
    if (len === 0) push(word, atom.style)
    else if (len + sep.length + word.length <= width) push(sep + word, atom.style)
    else {
      brk()
      push(word, atom.style)
    }
  }

  if (line.length > 0 || lines.length === 0) lines.push(line)
  return lines
}

type Atom = { text: string; style: TokenStyle; space: boolean }

/**
 * Flatten tokens into words, recording for each whether a space precedes it.
 *
 * The space has to be tracked explicitly rather than inferred at join time.
 * Words WITHIN a token are always space-separated, but two adjacent tokens may
 * be glued (`` `code`s ``, "**bold**text") or spaced ("a *b*") — and splitting
 * "hello " on " " yields a trailing empty string that silently drops the very
 * space that distinguishes the two cases.
 */
function atomize(tokens: Token[]): Atom[] {
  const atoms: Atom[] = []
  let prevEndedWithSpace = false

  for (const token of tokens) {
    if (token.text.length === 0) continue
    const leading = token.text.startsWith(" ")
    let firstOfToken = true
    // Consecutive spaces collapse, as they do in rendered markdown.
    for (const word of token.text.split(" ")) {
      if (word === "") continue
      atoms.push({
        text: word,
        style: token.style,
        space: firstOfToken ? leading || prevEndedWithSpace : true,
      })
      firstOfToken = false
    }
    prevEndedWithSpace = token.text.endsWith(" ")
  }

  return atoms
}
