// The hidden console behind ` — command registry, fake filesystem, and
// executor. Everything here is pure (commands take a ctx and return lines)
// except the real-data commands, which read the same module-level store and
// presence count the rest of the app uses. ConsolePage renders the results;
// nothing in the visible UI ever mentions this file exists.
import { getStore } from "../db"
import { about, contact, experience, identity, projects } from "./content"
import { QR_ROWS } from "./qr"
import { THEMES, type ThemeName } from "./theme"

export type OutStyle = "fg" | "dim" | "accent" | "error"
export type OutLine = { text: string; style?: OutStyle }

// Scrollback entries store UNWRAPPED text — ConsolePage re-wraps at render
// time so a terminal resize reflows the whole history (same philosophy as
// buildResumeLines being a useMemo on frameW).
export type ConsoleEntry =
  | { kind: "input"; text: string }
  | { kind: "output"; lines: OutLine[] }

// Lifted to App state so scrollback/history survive close/reopen for the
// whole SSH session — the Quake-console feel. Input value and scroll stay
// local to ConsolePage and reset each open.
export type ConsoleSession = {
  entries: ConsoleEntry[]
  history: string[]
  cwd: string
  booted: boolean
}

export type ConsoleCtx = {
  ip: string
  visitorNumber: number
  online: number
  cwd: string
  history: string[]
  theme: ThemeName
}

export type ExecResult = {
  lines: OutLine[]
  effect?: "exit" | "clear"
  cwd?: string
  theme?: ThemeName
}

export const HISTORY_MAX = 50
export const INPUT_MAX = 120

// Rows the console spends outside the scrollback: header + heavy rule +
// ↑ MORE indicator + prompt row + bottom rule + status bar.
export const CONSOLE_CHROME = 6

export function consoleRows(frameH: number): number {
  return Math.max(1, frameH - CONSOLE_CHROME)
}

// Evaluated once at server boot — this module is reached through the
// server → session → App → ConsolePage import chain, so `uptime` reports the
// process's real age without server.ts knowing the console exists.
const STARTED_AT = Date.now()

export function formatUptime(now = Date.now()): string {
  const totalSec = Math.max(0, Math.floor((now - STARTED_AT) / 1000))
  const days = Math.floor(totalSec / 86_400)
  const hours = Math.floor((totalSec % 86_400) / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const hhmm = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`
  if (days === 0) return `up ${hhmm}`
  return `up ${days} day${days === 1 ? "" : "s"}, ${hhmm}`
}

export const promptFor = (cwd: string) => `guest@${identity.banner}:${cwd}$`

export function bootLines(): OutLine[] {
  return [
    { text: `${identity.banner}/console v0.1 — guest shell`, style: "accent" },
    { text: "you found the console. it was never advertised.", style: "dim" },
    { text: "type 'help' for commands.", style: "dim" },
  ]
}

// ---------------------------------------------------------------------------
// Fake filesystem: two levels, a handful of files, one dotfile as the prize.

type FsNode = { kind: "file"; lines: string[] } | { kind: "dir"; children: string[] }

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9.]+/g, "-")

const FS: Record<string, FsNode> = {
  "~": {
    kind: "dir",
    // plain `ls` hides dotfiles — `ls -a` revealing .secrets is the prize
    children: [".secrets", "about.txt", "projects", "guestbook.db", "resume.pdf", "todo.md"],
  },
  "~/about.txt": { kind: "file", lines: about.bio.slice(0, 3) },
  "~/todo.md": {
    kind: "file",
    lines: [
      "[x] build ssh portfolio",
      "[x] hide a console in it",
      "[ ] fix that bug from 2024",
      "[ ] sleep",
    ],
  },
  "~/resume.pdf": {
    kind: "file",
    lines: ["cat: resume.pdf: this is a terminal. press esc, then r."],
  },
  "~/guestbook.db": {
    kind: "file",
    lines: ["cat: guestbook.db: binary file. try the 'guestbook' command instead."],
  },
  "~/.secrets": {
    kind: "file",
    lines: [
      "ok, you earned this:",
      "- the theme toggle had exactly two themes because i couldn't pick. now there are three. still can't pick.",
      "- the visitor counter counts you every time. yes, you're inflating it.",
      "- there is no deeper level. this is the bottom.",
    ],
  },
  "~/projects": { kind: "dir", children: projects.map((p) => slug(p.name)) },
}

for (const p of projects) {
  const lines = [p.tagline]
  if (p.url) lines.push(p.url)
  lines.push(`tech: ${p.tech.join(", ")}`)
  FS[`~/projects/${slug(p.name)}`] = { kind: "file", lines }
}

// Resolve a path argument relative to cwd into a canonical FS key, or null.
function resolvePath(cwd: string, arg: string): string | null {
  let base: string
  if (arg.startsWith("~")) base = arg
  else if (arg.startsWith("/")) return null // no real root here
  else base = `${cwd}/${arg}`
  const parts: string[] = []
  for (const piece of base.split("/")) {
    if (piece === "" || piece === ".") continue
    if (piece === "..") {
      if (parts.length > 1) parts.pop()
    } else parts.push(piece)
  }
  const key = parts.join("/")
  return key.startsWith("~") ? key : null
}

const err = (text: string): OutLine[] => [{ text, style: "error" }]

// ---------------------------------------------------------------------------
// Command registry

type Command = {
  name: string
  aliases?: string[]
  hidden?: boolean
  summary: string
  run: (args: string[], ctx: ConsoleCtx) => ExecResult
}

const COMMANDS: Command[] = [
  {
    name: "help",
    summary: "you are here",
    run: () => {
      const visible = COMMANDS.filter((c) => !c.hidden)
      const pad = Math.max(...visible.map((c) => c.name.length)) + 2
      return {
        lines: [
          { text: "available commands:", style: "dim" },
          ...visible.map((c) => ({ text: `  ${c.name.padEnd(pad)}${c.summary}` }) as OutLine),
          { text: "some commands are not listed.", style: "dim" },
        ],
      }
    },
  },
  {
    name: "fastfetch",
    aliases: ["neofetch"],
    summary: "system splash",
    run: (_a, ctx) => {
      // Block-letter LRNZO wordmark; kept fg so it never clashes with the
      // accent title / dim separator stacked above it.
      const logo = [
        "█    ███  █  █ ████ ████",
        "█    █  █ ██ █   █  █  █",
        "█    ███  █ ██  █   █  █",
        "█    █ █  █  █ █    █  █",
        "████ █  █ █  █ ████ ████",
      ]
      const title = `guest@${identity.host}`
      const online =
        ctx.online <= 1 ? "just you" : `${ctx.online} sessions`
      const info = [
        `OS: ${identity.banner} portfolio (TUI)`,
        `Host: ${identity.host}`,
        `Kernel: OpenTUI + ssh2`,
        `Uptime: ${formatUptime().replace(/^up /, "")}`,
        `Shell: ${identity.banner}/console v0.1`,
        `WM: React`,
        `Runtime: Bun + TypeScript`,
        `Visitors: ${getStore().totalVisits()}`,
        `Online: ${online}`,
        `You: visitor #${String(ctx.visitorNumber).padStart(4, "0")}`,
      ]
      // Zip the art column against the info column; whichever is taller pads
      // the other with blanks (the fake-fs `ls` uses the same join style).
      const w = Math.max(...logo.map((l) => l.length))
      const body: OutLine[] = []
      for (let i = 0; i < Math.max(logo.length, info.length); i++) {
        const art = (logo[i] ?? "").padEnd(w)
        body.push({ text: `${art}  ${info[i] ?? ""}`.trimEnd() })
      }
      return {
        lines: [
          { text: title, style: "accent" },
          { text: "─".repeat(title.length), style: "dim" },
          ...body,
        ],
      }
    },
  },
  {
    name: "whoami",
    summary: "who ssh'd in",
    run: (_a, ctx) => ({
      lines: [
        { text: "guest" },
        { text: `ip: ${ctx.ip}`, style: "dim" },
        { text: `visitor #${String(ctx.visitorNumber).padStart(4, "0")}`, style: "dim" },
      ],
    }),
  },
  {
    name: "visitors",
    summary: "total visit count",
    run: () => ({ lines: [{ text: `${getStore().totalVisits()} total visits` }] }),
  },
  {
    name: "online",
    summary: "who else is here",
    run: (_a, ctx) => ({
      lines: [
        {
          text:
            ctx.online <= 1
              ? "just you right now"
              : `${ctx.online} sessions connected right now`,
        },
      ],
    }),
  },
  {
    name: "guestbook",
    summary: "latest signatures",
    run: () => {
      const entries = getStore().listGuestbook(5)
      if (entries.length === 0)
        return { lines: [{ text: "no entries yet.", style: "dim" }] }
      return {
        lines: [
          ...entries.map(
            (e) =>
              ({
                text: `✱ ${e.name} · ${e.created_at.slice(0, 10)} — ${e.message}`,
              }) as OutLine,
          ),
          { text: "press esc, then b to sign", style: "dim" },
        ],
      }
    },
  },
  {
    name: "stats",
    aliases: ["analytics"],
    summary: "visit analytics",
    run: () => {
      const store = getStore()
      const daily = store.dailyStats(7)
      const totalUnique = store.totalUniqueIps()
      const peak = store.peakDay()
      const total = store.totalVisits()

      const lines: OutLine[] = [
        { text: `total visits: ${total}  ·  unique ips: ${totalUnique}`, style: "accent" },
      ]
      if (peak) {
        lines.push({
          text: `peak day: ${peak.day} (${peak.visits} visits)`,
          style: "dim",
        })
      }
      lines.push({ text: "─".repeat(30), style: "dim" })
      if (daily.length === 0) {
        lines.push({ text: "no data yet.", style: "dim" })
      } else {
        lines.push({
          text: " date        visits  unique  gb",
          style: "dim",
        })
        for (const d of daily) {
          const date = d.day.slice(5) // "MM-DD"
          lines.push({
            text: ` ${date.padEnd(12)}${String(d.visits).padStart(5)}  ${String(d.uniqueIps).padStart(5)}  ${String(d.guestbookEntries).padStart(3)}`,
          })
        }
      }
      lines.push({ text: "─".repeat(30), style: "dim" })
      lines.push({ text: "press esc, then s for full dashboard", style: "dim" })
      return { lines }
    },
  },
  {
    name: "uptime",
    summary: "server age",
    run: () => ({ lines: [{ text: `${formatUptime()} · 1 shell (this one)` }] }),
  },
  {
    name: "about",
    summary: "the human behind this",
    run: () => ({ lines: about.bio.filter((l) => l !== "").map((text) => ({ text }) as OutLine) }),
  },
  {
    name: "projects",
    summary: "things i've built",
    run: () => ({
      lines: [
        ...projects.map(
          (p) =>
            ({
              text: `${p.name} — ${p.tagline.split(". ")[0]!.replace(/\.$/, "")}`,
            }) as OutLine,
        ),
        { text: "cat projects/<name> for details", style: "dim" },
      ],
    }),
  },
  {
    name: "exp",
    aliases: ["experience"],
    summary: "where i've worked",
    run: () => ({
      lines: experience.map(
        (e) => ({ text: `${e.company} — ${e.role} (${e.dates})` }) as OutLine,
      ),
    }),
  },
  {
    name: "skills",
    summary: "the toolbox",
    run: () => ({ lines: about.skills.map((s) => ({ text: `✱ ${s}` }) as OutLine) }),
  },
  {
    name: "contact",
    summary: "reach out",
    run: () => ({
      lines: [
        { text: `email: ${contact.email}` },
        { text: `github: ${contact.github}` },
        { text: `linkedin: ${contact.linkedin}` },
        { text: contact.ssh, style: "dim" },
      ],
    }),
  },
  {
    name: "qr",
    summary: "linkedin, for your phone",
    run: () => ({
      // Rows ≤29 chars never re-wrap (wrapText passes short lines through),
      // so the module grid survives the scrollback reflow intact.
      lines: [
        ...QR_ROWS.map((text) => ({ text, style: "accent" }) as OutLine),
        { text: `  scan → ${contact.linkedin}`, style: "dim" },
      ],
    }),
  },
  {
    name: "ls",
    summary: "look around",
    run: (args, ctx) => {
      const showAll = args.includes("-a")
      const target = args.find((a) => !a.startsWith("-"))
      const key = target ? resolvePath(ctx.cwd, target) : ctx.cwd
      const node = key ? FS[key] : undefined
      if (!node) return { lines: err(`ls: cannot access '${target}': no such file or directory`) }
      if (node.kind === "file") return { lines: [{ text: target! }] }
      const names = node.children.filter((c) => showAll || !c.startsWith("."))
      const withDots = showAll ? [".", "..", ...names] : names
      return {
        lines: [
          {
            text: withDots
              .map((n) => (FS[`${key}/${n}`]?.kind === "dir" ? `${n}/` : n))
              .join("  "),
          },
        ],
      }
    },
  },
  {
    name: "cat",
    summary: "read a file",
    run: (args, ctx) => {
      const target = args[0]
      if (!target) return { lines: err("usage: cat <file>") }
      const key = resolvePath(ctx.cwd, target)
      const node = key ? FS[key] : undefined
      if (!node) return { lines: err(`cat: ${target}: no such file`) }
      if (node.kind === "dir") return { lines: err(`cat: ${target}: is a directory`) }
      return { lines: node.lines.map((text) => ({ text }) as OutLine) }
    },
  },
  {
    name: "cd",
    summary: "move around",
    run: (args, ctx) => {
      const target = args[0]
      if (!target || target === "~") return { lines: [], cwd: "~" }
      if (target === "/" || target.startsWith("/"))
        return { lines: err(`cd: ${target}: permission denied (you're a guest here)`) }
      const key = resolvePath(ctx.cwd, target)
      const node = key ? FS[key] : undefined
      if (!node) return { lines: err(`cd: no such directory: ${target}`) }
      if (node.kind === "file") return { lines: err(`cd: not a directory: ${target}`) }
      return { lines: [], cwd: key! }
    },
  },
  {
    name: "pwd",
    summary: "where am i",
    run: (_a, ctx) => ({ lines: [{ text: ctx.cwd.replace("~", "/home/guest") }] }),
  },
  {
    name: "echo",
    summary: "say it back",
    run: (args) => ({ lines: [{ text: args.join(" ") }] }),
  },
  {
    name: "theme",
    summary: "repaint the shell",
    run: (args, ctx) => {
      const names = Object.keys(THEMES) as ThemeName[]
      const arg = args[0]?.toLowerCase()
      if (!arg)
        return {
          lines: [
            { text: `current: ${ctx.theme}` },
            { text: `available: ${names.join(", ")}`, style: "dim" },
            { text: "usage: theme <name>", style: "dim" },
          ],
        }
      if (!names.includes(arg as ThemeName))
        return { lines: err(`theme: no such theme: ${arg}`) }
      if (arg === ctx.theme)
        return { lines: [{ text: `already on ${arg}`, style: "dim" }] }
      // The confirmation paints in the NEW accent — the state flip and this
      // line land in the same commit.
      return { theme: arg as ThemeName, lines: [{ text: `theme → ${arg}`, style: "accent" }] }
    },
  },
  {
    name: "clear",
    summary: "wipe the screen",
    run: () => ({ lines: [], effect: "clear" }),
  },
  {
    name: "exit",
    aliases: ["logout"],
    summary: "close the console",
    run: () => ({ lines: [{ text: "logout", style: "dim" }], effect: "exit" }),
  },
  {
    name: "history",
    hidden: true,
    summary: "what you typed",
    run: (_a, ctx) => ({
      lines: ctx.history.map(
        (h, i) => ({ text: `  ${String(i + 1).padStart(3)}  ${h}`, style: "dim" }) as OutLine,
      ),
    }),
  },
]

const rmJoke = (): ExecResult => ({
  lines: [
    { text: "rm: removing /home/lrnzo/portfolio ...", style: "dim" },
    { text: "rm: removing visitors.db ...", style: "dim" },
    { text: "rm: removing guestbook.db ...", style: "dim" },
    { text: "just kidding. everything here is read-only.", style: "accent" },
  ],
})

const isRfSlash = (args: string[]) =>
  args.some((a) => /^-[a-z]*(rf|fr)[a-z]*$/i.test(a)) && args.some((a) => a.startsWith("/"))

export function execute(rawInput: string, ctx: ConsoleCtx): ExecResult {
  const tokens = rawInput.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { lines: [] }
  let [name, ...args] = tokens as [string, ...string[]]

  // sudo: strip it and report the incident — unless it's the rm bit.
  if (name === "sudo") {
    if (args[0] === "rm" && isRfSlash(args.slice(1))) return rmJoke()
    return {
      lines: [
        { text: "guest is not in the sudoers file.", style: "error" },
        { text: "this incident will be reported.", style: "dim" },
      ],
    }
  }
  if (name === "rm") {
    if (isRfSlash(args)) return rmJoke()
    const target = args.find((a) => !a.startsWith("-")) ?? ""
    return { lines: err(`rm: cannot remove '${target}': read-only filesystem`) }
  }

  const cmd = COMMANDS.find((c) => c.name === name || c.aliases?.includes(name))
  if (!cmd)
    return {
      lines: [
        { text: `sh: command not found: ${name}`, style: "error" },
        { text: "try 'help'", style: "dim" },
      ],
    }
  return cmd.run(args, ctx)
}
