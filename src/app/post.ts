import type { PostDetail, PostSummary } from "../blog"
import { parseMarkdown, tokensText, wrapTokens, type Token } from "./markdown"
import { wrapText } from "./util"

// A post flattened into one entry per terminal row, on the resume.ts pattern.
// BlogPage renders a slice of this array, so wrapping must be resolved here at
// build time — the layout never relies on yoga text flow (see util.ts:33: one
// row too many and yoga shrinks the sibling rows to zero height, blanking the
// masthead and status bar).
export type PostLine =
  | { kind: "blank" }
  | { kind: "rule" }
  | { kind: "kicker"; text: string }
  | { kind: "title"; text: string }
  | { kind: "dek"; text: string }
  | { kind: "tags"; text: string }
  /** Cover alt text. No image is ever fetched — see the note in blog.ts. */
  | { kind: "caption"; text: string; prefix: string }
  | { kind: "heading"; tokens: Token[]; level: number }
  | { kind: "para"; tokens: Token[] }
  | { kind: "bullet"; tokens: Token[]; prefix: string }
  | { kind: "quote"; tokens: Token[]; prefix: string }
  | { kind: "code"; text: string }
  | { kind: "end" }

export const END_MARK = "✱ END OF ENTRY"

// Rows the reader spends outside the document: masthead + heavy rule +
// ↑/↓ indicators + bottom rule + status bar. Matches RESUME_CHROME.
export const POST_CHROME = 6

export function postRows(frameH: number): number {
  return Math.max(1, frameH - POST_CHROME)
}

/**
 * The characters of a line that PARTICIPATE IN THE REVEAL, as plain text.
 *
 * Not always the whole rendered row: the end mark's centring pad is drawn
 * statically rather than typed, exactly as the CV's is. Everything the
 * typewriter walks through is here, and BlogPage's Row must consume the same
 * prefixes in the same order — a branch that draws a prefix this function
 * doesn't know about runs the cursor off the end of its line, which stays
 * invisible until someone reads that far. blog.test.ts pins it.
 */
export function postLineText(line: PostLine, width: number): string {
  switch (line.kind) {
    case "blank":
      return ""
    case "rule":
      return "─".repeat(Math.max(0, width))
    case "kicker":
    case "title":
    case "dek":
    case "tags":
      return line.text
    case "caption":
      return line.prefix + line.text
    case "heading":
    case "para":
      return tokensText(line.tokens)
    case "bullet":
    case "quote":
      return line.prefix + tokensText(line.tokens)
    case "code":
      return CODE_INDENT + line.text
    case "end":
      return END_MARK
  }
}

/**
 * Printable chars per line for useStreamReveal. Derived from postLineText so
 * there is exactly one definition of the budget, never two that can drift.
 */
export function postLineLength(line: PostLine, width: number): number {
  return postLineText(line, width).length
}

const CODE_INDENT = "  "
const QUOTE_BAR = "▌ "
const CAPTION_BAR = "▌ "
const BULLET_MARK = "✱ "

/** ISO 8601 -> YYYY-MM-DD by slicing, not parsing: no timezone shift, no Date. */
export function postDate(iso: string | null): string {
  return typeof iso === "string" && iso.length >= 10 ? iso.slice(0, 10) : ""
}

/** "002 · NOTE · 2026-08-05 · 3 MIN" — empty fields drop out entirely. */
export function postKicker(post: PostSummary): string {
  return [post.no, post.kind, postDate(post.publishedAt), post.readingMinutes > 0 ? `${post.readingMinutes} MIN` : ""]
    .filter((p) => p !== "")
    .join(" · ")
}

export function buildPostLines(post: PostDetail, width: number): PostLine[] {
  const lines: PostLine[] = []
  const blank = () => lines.push({ kind: "blank" })
  const plain = (text: string, kind: "title" | "dek" | "tags") => {
    for (const l of wrapText(text, width)) lines.push({ kind, text: l })
  }

  const kicker = postKicker(post)
  if (kicker) lines.push({ kind: "kicker", text: kicker.slice(0, width) })
  blank()
  plain(post.title, "title")
  if (post.dek) {
    blank()
    plain(post.dek, "dek")
  }
  if (post.alt) {
    // An empty alt marks the image decorative, per the API's own convention —
    // announcing "COVER" for one would be noise, so it is skipped above.
    blank()
    wrapText(`COVER · ${post.alt}`, Math.max(1, width - CAPTION_BAR.length)).forEach((l, i) =>
      lines.push({ kind: "caption", text: l, prefix: i === 0 ? CAPTION_BAR : " ".repeat(CAPTION_BAR.length) }),
    )
  }
  if (post.tags.length > 0) {
    blank()
    plain(post.tags.map((t) => `#${t}`).join(" "), "tags")
  }
  blank()
  lines.push({ kind: "rule" })

  for (const block of parseMarkdown(post.body)) {
    switch (block.kind) {
      case "hr":
        blank()
        lines.push({ kind: "rule" })
        break
      case "heading":
        blank()
        for (const l of wrapTokens(block.tokens, width))
          lines.push({ kind: "heading", tokens: l, level: block.level })
        break
      case "para":
        blank()
        for (const l of wrapTokens(block.tokens, width)) lines.push({ kind: "para", tokens: l })
        break
      case "quote":
        blank()
        for (const l of wrapTokens(block.tokens, Math.max(1, width - QUOTE_BAR.length)))
          lines.push({ kind: "quote", tokens: l, prefix: QUOTE_BAR })
        break
      case "bullet": {
        // An ordered marker keeps its own number ("1."); continuation rows pad
        // to the same width so the text column stays flush.
        const mark = /^\d/.test(block.marker) ? `${block.marker} ` : BULLET_MARK
        blank()
        wrapTokens(block.tokens, Math.max(1, width - mark.length)).forEach((l, i) =>
          lines.push({ kind: "bullet", tokens: l, prefix: i === 0 ? mark : " ".repeat(mark.length) }),
        )
        break
      }
      case "code":
        blank()
        // Code is truncated, never wrapped: re-flowing a line of code changes
        // what it says.
        for (const l of block.lines)
          lines.push({ kind: "code", text: l.slice(0, Math.max(0, width - CODE_INDENT.length)) })
        break
    }
  }

  blank()
  lines.push({ kind: "end" })
  return lines
}

/**
 * One index row, split into the columns SelectableList draws.
 *
 * The trailer is dropped before the title is truncated — losing the date costs
 * less than losing the words that tell you what the entry is.
 */
export function postRowParts(post: PostSummary, width: number): { left: string; right: string } {
  const date = postDate(post.publishedAt)
  const right = [date, post.kind, post.readingMinutes > 0 ? `${post.readingMinutes} MIN` : ""]
    .filter((p) => p !== "")
    .join(" · ")
  const no = post.no ? `${post.no}  ` : ""
  const GAP = 2

  const room = width - no.length - right.length - GAP
  if (right.length > 0 && room >= 12) return { left: no + truncate(post.title, room), right }
  return { left: truncate(no + post.title, width), right: "" }
}

function truncate(s: string, max: number): string {
  if (max <= 0) return ""
  if (s.length <= max) return s
  return max > 1 ? s.slice(0, max - 1) + "…" : "…"
}
