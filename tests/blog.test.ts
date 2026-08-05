import { describe, expect, test } from "bun:test"
import { isEnabled, parseDetail, parseIndex, parseSummary, type PostDetail } from "../src/blog"
import {
  parseInline,
  parseMarkdown,
  sliceTokens,
  tokensText,
  wrapTokens,
  type Token,
} from "../src/app/markdown"
import {
  END_MARK,
  POST_CHROME,
  buildPostLines,
  postDate,
  postKicker,
  postLineLength,
  postLineText,
  postRowParts,
  postRows,
} from "../src/app/post"

// The exact body api.lrnzo.space returned for entry 002, verbatim.
const LIVE_ROW = {
  id: "b17f7117-3bdd-4e09-968c-0212f342ec0a",
  slug: "i-already-write-these-up-once-i-wanted-that-to-be-enough",
  no: "002",
  title: "I already write these up once. I wanted that to be enough.",
  dek: "Every fix here gets explained already, in its commit message, while I still remember why. This site's MCP posting tool exists so that explanation can become a draft here too — in the same breath, not a colder second pass weeks later.",
  publishedAt: "2026-08-05T16:45:56.581Z",
  updatedAt: "2026-08-05T09:39:16.025Z",
  kind: "NOTE",
  tags: ["mcp", "writing", "tooling"],
  readingMinutes: 3,
  media: {
    alt: "A line-art side profile of a head and a hand, thumb raised near the chin, with a cluster of connected white nodes overlaid on the head like a small network, on a flat terracotta background.",
    src: "https://api.lrnzo.space/media/df44da18a35e51f4.png",
    kind: "image",
    width: 2880,
    height: 1620,
  },
  status: "published",
  body:
    "There's a version of this site's changelog that only I ever see: the commit messages. They're long, honestly — longer than most people write for a personal project — because that's where I actually work out *why* something changed, not just what.\n" +
    "\n" +
    "## The tool surface is the whole design decision\n" +
    "\n" +
    "It's small on purpose: create a draft, list drafts, read one back, attach an image, delete a draft that shouldn't exist. That's it. Notably absent — there's no way to edit a published post, and no way to publish one at all.\n",
}

// Every frame this app can produce. Mirrors tests/music.test.ts.
const WIDTHS = Array.from({ length: 25 }, (_, i) => 60 + i)
const HEIGHTS = Array.from({ length: 19 }, (_, i) => 14 + i)

function detail(over: Partial<PostDetail> = {}): PostDetail {
  return { ...(parseDetail(LIVE_ROW) as PostDetail), ...over }
}

describe("the network is never touched under test", () => {
  test("NODE_ENV=test disables the module outright", () => {
    // bun test sets NODE_ENV=test, and smoke.test.ts spreads process.env into
    // the server it spawns — this one check keeps the whole suite offline.
    expect(isEnabled()).toBe(false)
  })
})

describe("parseSummary", () => {
  test("reads the live row", () => {
    const p = parseSummary(LIVE_ROW)
    expect(p).not.toBeNull()
    expect(p!.slug).toBe(LIVE_ROW.slug)
    expect(p!.no).toBe("002")
    expect(p!.kind).toBe("NOTE")
    expect(p!.tags).toEqual(["mcp", "writing", "tooling"])
    expect(p!.readingMinutes).toBe(3)
    expect(p!.alt).toBe(LIVE_ROW.media.alt)
  })

  test("drops a row with no slug or no title", () => {
    expect(parseSummary({ ...LIVE_ROW, slug: "" })).toBeNull()
    expect(parseSummary({ ...LIVE_ROW, slug: undefined })).toBeNull()
    expect(parseSummary({ ...LIVE_ROW, title: "" })).toBeNull()
  })

  test("survives an absent updatedAt — the API omits the key, it is not null", () => {
    const { updatedAt: _omitted, ...row } = LIVE_ROW
    expect(parseSummary(row)).not.toBeNull()
  })

  test("survives a null or malformed media", () => {
    expect(parseSummary({ ...LIVE_ROW, media: null })!.alt).toBe("")
    expect(parseSummary({ ...LIVE_ROW, media: "nope" })!.alt).toBe("")
    expect(parseSummary({ ...LIVE_ROW, media: { src: "/log/media/004.svg" } })!.alt).toBe("")
  })

  test("defaults rather than dropping when a soft field is wrong", () => {
    const p = parseSummary({
      ...LIVE_ROW,
      no: 2,
      dek: null,
      kind: undefined,
      tags: "mcp",
      readingMinutes: "3",
      publishedAt: 17,
    })!
    expect(p.no).toBe("")
    expect(p.dek).toBe("")
    expect(p.kind).toBe("")
    expect(p.tags).toEqual([])
    expect(p.readingMinutes).toBe(0)
    expect(p.publishedAt).toBeNull()
  })

  test("keeps only the string members of a mixed tags array", () => {
    expect(parseSummary({ ...LIVE_ROW, tags: ["a", 3, null, "b"] })!.tags).toEqual(["a", "b"])
  })

  test("never throws on garbage", () => {
    for (const bad of [null, undefined, 0, "", "x", [], true, {}, { slug: {} }]) {
      expect(() => parseSummary(bad)).not.toThrow()
      expect(parseSummary(bad)).toBeNull()
    }
  })
})

describe("parseIndex", () => {
  test("unwraps the {data,total,page,limit} envelope", () => {
    const posts = parseIndex({ data: [LIVE_ROW], total: 1, page: 1, limit: 10 })
    expect(posts).toHaveLength(1)
    expect(posts![0]!.slug).toBe(LIVE_ROW.slug)
  })

  test("drops bad rows without failing the whole list", () => {
    const posts = parseIndex({ data: [{ nope: true }, LIVE_ROW, null] })
    expect(posts).toHaveLength(1)
  })

  test("returns null when the envelope itself is wrong", () => {
    for (const bad of [null, [], { data: "x" }, {}, "{}"]) expect(parseIndex(bad)).toBeNull()
  })

  test("an empty log is a valid answer, not an error", () => {
    expect(parseIndex({ data: [], total: 0, page: 1, limit: 10 })).toEqual([])
  })
})

describe("parseDetail", () => {
  test("carries the body through", () => {
    expect(parseDetail(LIVE_ROW)!.body).toBe(LIVE_ROW.body)
  })

  test("a missing body degrades to empty rather than dropping the post", () => {
    const { body: _omitted, ...row } = LIVE_ROW
    expect(parseDetail(row)!.body).toBe("")
  })
})

describe("parseInline", () => {
  const text = (s: string) => tokensText(parseInline(s))

  test("strips markers and keeps the styles", () => {
    expect(parseInline("*why*")).toEqual([{ text: "why", style: "em" }])
    expect(parseInline("**bold**")).toEqual([{ text: "bold", style: "strong" }])
    expect(parseInline("`code`")).toEqual([{ text: "code", style: "code" }])
    expect(parseInline("***both***")).toEqual([{ text: "both", style: "strong" }])
  })

  test("keeps a link's label and drops its href", () => {
    expect(parseInline("a [label](https://x.y) b")).toEqual([
      { text: "a ", style: "plain" },
      { text: "label", style: "link" },
      { text: " b", style: "plain" },
    ])
  })

  test("renders an image as its alt text", () => {
    expect(text("![alt here](/img.png)")).toBe("alt here")
    // A decorative image (empty alt) leaves nothing behind.
    expect(text("![](/img.png)")).toBe("")
  })

  test("leaves snake_case identifiers alone", () => {
    // Without the word-boundary rule, BLOG_URL..NOWPLAYING_URL emphasises as one run.
    expect(parseInline("BLOG_URL and NOWPLAYING_URL")).toEqual([
      { text: "BLOG_URL and NOWPLAYING_URL", style: "plain" },
    ])
  })

  test("an unterminated marker stays literal", () => {
    expect(text("an * orphan")).toBe("an * orphan")
    expect(text("an ` orphan")).toBe("an ` orphan")
    expect(text("a [not a link")).toBe("a [not a link")
  })

  test("honours backslash escapes", () => {
    expect(text("a \\*literal\\* b")).toBe("a *literal* b")
  })

  test("never throws on hostile input", () => {
    for (const bad of ["*".repeat(200), "[".repeat(200), "`".repeat(51), "![](", "**", "_"])
      expect(() => parseInline(bad)).not.toThrow()
  })
})

describe("parseMarkdown", () => {
  test("reads the live body's block structure", () => {
    expect(parseMarkdown(LIVE_ROW.body).map((b) => b.kind)).toEqual([
      "para",
      "heading",
      "para",
    ])
  })

  test("recognises the block set", () => {
    const blocks = parseMarkdown(
      "# One\n\n## Two\n\ntext\n\n- a\n- b\n\n1. first\n\n> quoted\n\n```ts\ncode()\n```\n\n---\n",
    )
    expect(blocks.map((b) => b.kind)).toEqual([
      "heading",
      "heading",
      "para",
      "bullet",
      "bullet",
      "bullet",
      "quote",
      "code",
      "hr",
    ])
    const h = blocks[0]!
    expect(h.kind === "heading" ? h.level : 0).toBe(1)
  })

  test("keeps fenced code verbatim, including its blank lines", () => {
    const blocks = parseMarkdown("```ts\nconst a = 1\n\n  indented()\n```")
    expect(blocks[0]).toEqual({ kind: "code", lines: ["const a = 1", "", "  indented()"], lang: "ts" })
  })

  test("an unterminated fence runs to the end instead of eating the rest", () => {
    const blocks = parseMarkdown("```\nstill code\nmore code")
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.kind).toBe("code")
  })

  test("joins a wrapped paragraph into one block", () => {
    const blocks = parseMarkdown("one\ntwo\nthree")
    expect(blocks).toHaveLength(1)
    const p = blocks[0]!
    expect(p.kind === "para" ? tokensText(p.tokens) : "").toBe("one two three")
  })

  test("normalises CRLF", () => {
    expect(parseMarkdown("a\r\n\r\n## b").map((b) => b.kind)).toEqual(["para", "heading"])
  })

  test("never throws", () => {
    for (const bad of ["", "\n\n\n", "#", ">", "-", "```", "*".repeat(500), " "])
      expect(() => parseMarkdown(bad)).not.toThrow()
  })
})

describe("wrapTokens", () => {
  const line = (ts: Token[]) => ts.map((t) => t.text).join("")

  test("never exceeds the width, at any width", () => {
    const tokens = parseInline(LIVE_ROW.dek + " `someVeryLongIdentifierIndeed` **and more words**")
    for (let w = 1; w <= 84; w++)
      for (const l of wrapTokens(tokens, w)) expect(line(l).length).toBeLessThanOrEqual(w)
  })

  test("hard-breaks a word longer than the width", () => {
    const wrapped = wrapTokens([{ text: "a".repeat(30), style: "plain" }], 10)
    expect(wrapped.map(line)).toEqual(["a".repeat(10), "a".repeat(10), "a".repeat(10)])
  })

  test("keeps the space between two differently-styled tokens", () => {
    // "hello " + "world" must not join into "helloworld": the trailing space
    // splits to an empty part that a naive wrapper drops.
    const wrapped = wrapTokens(
      [
        { text: "hello ", style: "plain" },
        { text: "world", style: "em" },
      ],
      40,
    )
    expect(line(wrapped[0]!)).toBe("hello world")
  })

  test("keeps two glued tokens glued", () => {
    const wrapped = wrapTokens(
      [
        { text: "code", style: "code" },
        { text: "s follow", style: "plain" },
      ],
      40,
    )
    expect(line(wrapped[0]!)).toBe("codes follow")
  })

  test("loses no text at any width wide enough to avoid hard breaks", () => {
    const tokens = parseInline(LIVE_ROW.dek)
    const flat = tokensText(tokens).replace(/\s+/g, " ").trim()
    // Below the longest word the wrapper hard-breaks mid-word by design, so a
    // space-joined round trip only holds above that threshold.
    const longest = Math.max(...flat.split(" ").map((w) => w.length))
    for (let w = longest; w <= 84; w++) {
      const joined = wrapTokens(tokens, w).map(line).join(" ").replace(/\s+/g, " ").trim()
      expect(joined).toBe(flat)
    }
  })

  test("a hard break loses no characters either", () => {
    const tokens = parseInline("supercalifragilistic")
    for (let w = 3; w <= 20; w++)
      expect(wrapTokens(tokens, w).map(line).join("")).toBe("supercalifragilistic")
  })

  test("carries the style across a line break", () => {
    const wrapped = wrapTokens([{ text: "alpha beta gamma", style: "code" }], 7)
    for (const l of wrapped) for (const t of l) expect(t.style).toBe("code")
  })

  test("returns one empty line for no tokens", () => {
    expect(wrapTokens([], 40)).toEqual([[]])
  })
})

describe("sliceTokens", () => {
  const tokens: Token[] = [
    { text: "abc", style: "plain" },
    { text: "de", style: "strong" },
  ]

  test("cuts on a character budget, mid-token if it must", () => {
    expect(sliceTokens(tokens, 0)).toEqual([])
    expect(sliceTokens(tokens, 2)).toEqual([{ text: "ab", style: "plain" }])
    expect(sliceTokens(tokens, 4)).toEqual([
      { text: "abc", style: "plain" },
      { text: "d", style: "strong" },
    ])
    expect(sliceTokens(tokens, 99)).toEqual(tokens)
  })
})

describe("postKicker / postDate / postRowParts", () => {
  test("slices the date rather than parsing it — no timezone shift", () => {
    expect(postDate("2026-08-05T16:45:56.581Z")).toBe("2026-08-05")
    expect(postDate(null)).toBe("")
    expect(postDate("nope")).toBe("")
  })

  test("drops empty fields out of the kicker", () => {
    const p = parseSummary(LIVE_ROW)!
    expect(postKicker(p)).toBe("002 · NOTE · 2026-08-05 · 3 MIN")
    expect(postKicker({ ...p, no: "", kind: "", readingMinutes: 0 })).toBe("2026-08-05")
  })

  test("a row always fits its width, at every width", () => {
    const p = parseSummary(LIVE_ROW)!
    for (const w of WIDTHS) {
      const { left, right } = postRowParts(p, w)
      expect(left.length + right.length).toBeLessThanOrEqual(w)
    }
  })

  test("drops the trailer before it truncates the title", () => {
    const p = parseSummary(LIVE_ROW)!
    const { left, right } = postRowParts(p, 24)
    expect(right).toBe("")
    expect(left.length).toBeLessThanOrEqual(24)
  })
})

describe("buildPostLines", () => {
  test("opens with the kicker and closes with the end mark", () => {
    const lines = buildPostLines(detail(), 84)
    expect(lines[0]).toEqual({ kind: "kicker", text: "002 · NOTE · 2026-08-05 · 3 MIN" })
    expect(lines[lines.length - 1]).toEqual({ kind: "end" })
    expect(postLineText(lines[lines.length - 1]!, 84)).toBe(END_MARK)
  })

  test("announces the cover as alt text and never as an image", () => {
    const lines = buildPostLines(detail(), 84)
    const caption = lines.filter((l) => l.kind === "caption")
    expect(caption.length).toBeGreaterThan(0)
    expect(postLineText(caption[0]!, 84)).toContain("COVER · A line-art side profile")
    // Nothing anywhere in the rendered document points at the image file.
    for (const l of lines) expect(postLineText(l, 84)).not.toContain("api.lrnzo.space/media")
  })

  test("skips the caption for a decorative image", () => {
    // An empty alt marks the image decorative, per the API's own convention.
    const lines = buildPostLines(detail({ alt: "" }), 84)
    expect(lines.some((l) => l.kind === "caption")).toBe(false)
  })

  test("skips the dek and tags when the post has none", () => {
    const lines = buildPostLines(detail({ dek: "", tags: [] }), 84)
    expect(lines.some((l) => l.kind === "dek")).toBe(false)
    expect(lines.some((l) => l.kind === "tags")).toBe(false)
  })

  test("truncates code instead of re-wrapping it", () => {
    const lines = buildPostLines(detail({ body: "```\n" + "x".repeat(200) + "\n```" }), 64)
    const code = lines.filter((l) => l.kind === "code")
    expect(code).toHaveLength(1)
    expect(postLineLength(code[0]!, 64)).toBeLessThanOrEqual(64)
  })

  test("every line fits the frame, at every width", () => {
    // One row too wide and yoga shrinks the sibling rows to zero height,
    // blanking the masthead and the status bar (see util.ts:33).
    const post = detail({
      body:
        "A paragraph with a `veryLongInlineCodeIdentifierThatCannotBeBroken` in it.\n\n" +
        "- a bullet long enough to wrap across several rows of a narrow terminal frame\n\n" +
        "1. an ordered item that also wraps because it goes on and on and on and on\n\n" +
        "> a quoted line long enough to wrap as well, which is the point of it\n\n" +
        "## A heading that is itself long enough to need wrapping on a narrow frame\n",
    })
    for (const w of WIDTHS)
      for (const line of buildPostLines(post, w))
        expect(postLineLength(line, w)).toBeLessThanOrEqual(w)
  })

  test("never throws on a hostile body, at any width", () => {
    const bodies = ["", "\n\n", "#".repeat(200), "```", ">".repeat(50), "- ".repeat(200), " "]
    for (const body of bodies)
      for (const w of WIDTHS) expect(() => buildPostLines(detail({ body }), w)).not.toThrow()
  })

  test("bullet continuation rows pad to the marker's own width", () => {
    const lines = buildPostLines(
      detail({ body: "1. an ordered item long enough that it has to wrap onto a second row" }),
      40,
    )
    const bullets = lines.filter((l) => l.kind === "bullet")
    expect(bullets.length).toBeGreaterThan(1)
    expect(bullets.map((b) => b.prefix).slice(0, 2)).toEqual(["1. ", "   "])
  })
})

describe("postLineLength", () => {
  test("is exactly the length of the revealed text, for every kind", () => {
    // The reveal counts characters; a kind whose budget disagrees with what
    // BlogPage draws runs the cursor off the end of its line.
    const post = detail({ body: "para\n\n## head\n\n- bullet\n\n> quote\n\n```\ncode\n```\n\n---\n" })
    const kinds = new Set<string>()
    for (const w of WIDTHS)
      for (const line of buildPostLines(post, w)) {
        kinds.add(line.kind)
        expect(postLineLength(line, w)).toBe(postLineText(line, w).length)
      }
    // Guard against the sweep silently stopping to cover a kind.
    expect(kinds).toEqual(
      new Set(["kicker", "blank", "title", "dek", "caption", "tags", "rule", "para", "heading", "bullet", "quote", "code", "end"]),
    )
  })

  test("a rule sweeps the full frame width", () => {
    for (const w of WIDTHS) expect(postLineLength({ kind: "rule" }, w)).toBe(w)
  })

  test("a blank row reveals nothing", () => {
    expect(postLineLength({ kind: "blank" }, 84)).toBe(0)
  })
})

describe("postRows", () => {
  test("leaves room for the page chrome and never goes below one row", () => {
    for (const h of HEIGHTS) {
      expect(postRows(h)).toBe(h - POST_CHROME)
      expect(postRows(h)).toBeGreaterThanOrEqual(1)
    }
    expect(postRows(1)).toBe(1)
    expect(postRows(0)).toBe(1)
  })
})

describe("the whole document, at every frame size", () => {
  test("builds, fits, and scrolls to a stable end", () => {
    const post = detail()
    for (const w of WIDTHS) {
      const lines = buildPostLines(post, w)
      expect(lines.length).toBeGreaterThan(0)
      for (const h of HEIGHTS) {
        const rows = postRows(h)
        const maxScroll = Math.max(0, lines.length - rows)
        // The last screen is always full: scrolling to the end never leaves a
        // gap between the text and the bottom rule.
        expect(lines.slice(maxScroll, maxScroll + rows).length).toBe(Math.min(rows, lines.length))
      }
    }
  })
})
