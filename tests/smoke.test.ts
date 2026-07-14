// Integration smoke test: boots the real server on a scratch port and drives
// it with a real ssh2 client — the same handshake, PTY, and resize flow an
// actual visitor's ssh client performs.
import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client, type ClientChannel } from "ssh2"
import { identity } from "../src/app/content"
import { THEMES } from "../src/app/theme"

// The UI renders copy in ALL CAPS, so predicates must be case-insensitive.
const containsCI = (all: string, needle: string) => all.toLowerCase().includes(needle.toLowerCase())

// Rows mix colored spans, so SGR codes interleave mid-string ("CI-GUEST"
// then \x1b[…m then " · 2026-…"); strip them before matching across spans.
const stripAnsi = (all: string) => all.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")

// Typewriter text (About bio, CV stream, console banner) arrives in
// budget-sized chunks, and where a chunk boundary lands depends on the total
// char count AND frame coalescing — any word can get sliced mid-stream. Other
// rows keep animating while the typewriter runs (header pulse, rule sweeps,
// glitch decay, the ▮ cursor glyph), so their cells land BETWEEN the two
// halves of a sliced word even after stripping SGR codes. Match a typed
// phrase as its characters in order, tolerating interleaved non-alphanumeric
// cells — interleaved animation junk is block/box glyphs, never letters, and
// unrelated text always interposes letters that break the sequence.
const typedMatch = (phrase: string) => {
  const re = new RegExp(
    phrase
      .toLowerCase()
      .split("")
      .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("[^a-z0-9]*"),
  )
  return (all: string) => re.test(stripAnsi(all).toLowerCase())
}

// Proves a takeover (CV/guestbook/console) closed back to the app: About
// remounts and retypes its bio. The header pulse (and, for the console, the
// tail of the ` glitch burst) animates over the first bio lines as they
// type, interleaving LETTER cells between chunks — so early bio words can
// never be matched reliably. The last bio line types ~700ms in, after those
// animations settle, and streams clean.
const backOnAbout = typedMatch("no browser involved")

// A theme accent painted as a truecolor SGR foreground proves which theme is live.
function accentSgr(name: keyof typeof THEMES): string {
  const hex = THEMES[name].accent
  const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((h) => parseInt(h, 16))
  return `38;2;${r};${g};${b}`
}

const PORT = 2299
let serverProc: ReturnType<typeof Bun.spawn>
let tmpDir: string

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "ssh-portfolio-test-"))
  const keyPath = join(tmpDir, "host_key")
  const keygen = Bun.spawnSync(["ssh-keygen", "-t", "ed25519", "-f", keyPath, "-N", "", "-q"])
  if (keygen.exitCode !== 0) throw new Error("ssh-keygen failed")

  serverProc = Bun.spawn(["bun", "src/server.ts"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      BIND: "127.0.0.1",
      HOST_KEY_PATH: keyPath,
      IDLE_TIMEOUT_MS: "30000",
      // scratch database — tests must never touch ./data
      DB_PATH: join(tmpDir, "test.db"),
    },
    stdout: "pipe",
  })

  // wait for the listening line (stdout is a stream because of stdout: "pipe")
  const reader = (serverProc.stdout as ReadableStream<Uint8Array>).getReader()
  const deadline = Date.now() + 10_000
  let buf = ""
  while (!buf.includes("listening") && Date.now() < deadline) {
    const { value, done } = await reader.read()
    if (done) break
    buf += new TextDecoder().decode(value)
  }
  reader.releaseLock()
  if (!buf.includes("listening")) throw new Error(`server never came up: ${buf}`)
})

afterAll(() => {
  serverProc?.kill()
  rmSync(tmpDir, { recursive: true, force: true })
})

function connect(): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client()
    client.on("ready", () => resolve(client))
    client.on("error", reject)
    client.connect({ host: "127.0.0.1", port: PORT, username: "smoke-test", password: "x" })
  })
}

function shell(client: Client, cols = 80, rows = 24): Promise<ClientChannel> {
  return new Promise((resolve, reject) => {
    client.shell({ term: "xterm-256color", cols, rows }, (err, stream) =>
      err ? reject(err) : resolve(stream),
    )
  })
}

function collectUntil(
  stream: ClientChannel,
  predicate: (all: string) => boolean,
  timeoutMs = 8000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let all = ""
    const timer = setTimeout(
      () => reject(new Error(`timeout; got ${all.length} bytes:\n${all.slice(-500)}`)),
      timeoutMs,
    )
    stream.on("data", (d: Buffer) => {
      all += d.toString("utf8")
      if (predicate(all)) {
        clearTimeout(timer)
        resolve(all)
      }
    })
  })
}

test("anonymous visitor gets the TUI with the owner's name", async () => {
  const client = await connect()
  try {
    const stream = await shell(client)
    // the splash auto-advances to the main app after ~2s
    const frame = await collectUntil(stream, (s) => containsCI(s, identity.name))
    expect(containsCI(frame, identity.name)).toBe(true)
    expect(containsCI(frame, "about")).toBe(true)
  } finally {
    client.end()
  }
})

test("window-change re-renders at the new width", async () => {
  const client = await connect()
  try {
    const stream = await shell(client, 80, 24)
    await collectUntil(stream, (s) => containsCI(s, identity.name))
    stream.setWindow(40, 120, 0, 0)
    // a 40-row frame positions the cursor on rows the 24-row frame never had
    await collectUntil(stream, (s) => /\[(2[5-9]|3[0-9]|40);\d+H/.test(s))
  } finally {
    client.end()
  }
})

test("q ends the session with exit status 0", async () => {
  const client = await connect()
  try {
    const stream = await shell(client)
    await collectUntil(stream, (s) => containsCI(s, identity.name))
    const exitCode = new Promise<number>((resolve) => stream.on("exit", resolve))
    stream.write("q")
    expect(await exitCode).toBe(0)
  } finally {
    client.end()
  }
})

test("t switches to the circuit theme live", async () => {
  const client = await connect()
  try {
    const stream = await shell(client)
    await collectUntil(stream, (s) => containsCI(s, identity.name))
    stream.write("t")
    // the circuit accent painted as truecolor SGR proves the repaint happened
    await collectUntil(stream, (s) => s.includes(accentSgr("circuit")))
  } finally {
    client.end()
  }
})

// NOTE: OpenTUI diff-renders — only changed cells are re-emitted, so
// predicates must match text that is NEW on screen, not chrome that partially
// survives from the previous frame (e.g. "N2 / EXPERIENCE" reuses cells of
// "N1 / ABOUT" and never streams contiguously).
test(
  "enter expands a list row into the record page",
  async () => {
    const client = await connect()
    try {
      const stream = await shell(client)
      await collectUntil(stream, (s) => containsCI(s, identity.name))
      stream.write("e") // experience section: dates column is newly drawn
      await collectUntil(stream, (s) => containsCI(s, "JUL 2026"))
      stream.write("\r") // expand the selected row
      // the record-page breadcrumb suffix ("… / 01") only exists expanded
      await collectUntil(stream, (s) => containsCI(s, "/ 01"))
    } finally {
      client.end()
    }
  },
  15000,
)

test(
  "r swaps the frame for the CV page, G scrolls to the end, esc returns",
  async () => {
    const client = await connect()
    try {
      const stream = await shell(client)
      await collectUntil(stream, (s) => containsCI(s, identity.name))
      stream.write("r") // CV takeover: the EDUCATION heading is newly drawn
      await collectUntil(stream, typedMatch("education"))
      stream.write("G") // jump to the bottom of the document
      await collectUntil(stream, typedMatch("end of document"))
      stream.write("\x1b") // esc returns to the regular app (about retypes)
      await collectUntil(stream, backOnAbout)
    } finally {
      client.end()
    }
  },
  15000,
)

test("the about page shows this session's visitor number", async () => {
  const client = await connect()
  try {
    const stream = await shell(client)
    // don't assert the exact number — every test connection increments it
    await collectUntil(stream, (s) => /VISITOR N\d+/i.test(s))
  } finally {
    client.end()
  }
})

test(
  "b opens the guestbook and the compose flow stores a message",
  async () => {
    const client = await connect()
    try {
      const stream = await shell(client)
      await collectUntil(stream, (s) => containsCI(s, identity.name))
      stream.write("b") // guestbook takeover: header is newly drawn
      await collectUntil(stream, (s) => containsCI(s, "guestbook"))
      stream.write("n") // compose form
      await collectUntil(stream, (s) => containsCI(s, "name (optional)"))
      // name with a typo corrected by two backspaces (\x7f) — the META-line
      // match below only succeeds if they actually deleted the "xq", so this
      // doubles as backspace regression coverage; enter advances to message
      stream.write("ci-guestxq\x7f\x7f\r")
      stream.write("hello from the smoke test\r") // message, enter submits
      // the message text already streamed as compose-field echo, so match the
      // entry META line — "name · date" only exists in the browse list
      await collectUntil(stream, (s) => containsCI(stripAnsi(s), "ci-guest ·"))
      stream.write("\x1b") // esc returns to the regular app (about retypes)
      await collectUntil(stream, backOnAbout)
    } finally {
      client.end()
    }
  },
  15000,
)

test(
  "a second entry from the same ip is rate limited",
  async () => {
    const client = await connect()
    try {
      const stream = await shell(client)
      await collectUntil(stream, (s) => containsCI(s, identity.name))
      stream.write("b")
      await collectUntil(stream, (s) => containsCI(s, "guestbook"))
      stream.write("n")
      await collectUntil(stream, (s) => containsCI(s, "name (optional)"))
      stream.write("\r") // skip the name field
      stream.write("second attempt\r")
      await collectUntil(stream, (s) => containsCI(s, "rate limited"))
    } finally {
      client.end()
    }
  },
  15000,
)

test(
  "arrow keys move the compose cursor for mid-text edits",
  async () => {
    const client = await connect()
    try {
      const stream = await shell(client)
      await collectUntil(stream, (s) => containsCI(s, identity.name))
      stream.write("b")
      await collectUntil(stream, (s) => containsCI(s, "guestbook"))
      stream.write("n")
      await collectUntil(stream, (s) => containsCI(s, "name (optional)"))
      // type "bd", arrow-left to the start, insert "a" — every cell of the
      // field shifts, so the corrected "abd" streams contiguously (see the
      // diff-render NOTE above); no submit, so this stays rate-limit-free
      stream.write("bd\x1b[D\x1b[Da")
      await collectUntil(stream, (s) => containsCI(stripAnsi(s), "abd"))
    } finally {
      client.end()
    }
  },
  15000,
)

test(
  "` opens the hidden console; commands run; exit returns to the app",
  async () => {
    const client = await connect()
    try {
      const stream = await shell(client)
      await collectUntil(stream, (s) => containsCI(s, identity.name))
      stream.write("`") // hidden console takeover: boot banner is newly drawn
      // "guest shell" is banner line 1 and types INSIDE the ` glitch burst,
      // which can eat one of its letters (see backOnAbout); the closing
      // banner line lands after the burst.
      await collectUntil(stream, typedMatch("for commands"))
      stream.write("whoami\r")
      await collectUntil(stream, typedMatch("visitor #"))
      stream.write("sudo rm -rf /\r") // the bit must stay a bit
      await collectUntil(stream, typedMatch("just kidding"))
      stream.write("exit\r") // the exit command closes the console too
      await collectUntil(stream, backOnAbout)
    } finally {
      client.end()
    }
  },
  15000,
)

test(
  "esc closes the console back to the app",
  async () => {
    const client = await connect()
    try {
      const stream = await shell(client)
      await collectUntil(stream, (s) => containsCI(s, identity.name))
      stream.write("`")
      await collectUntil(stream, typedMatch("for commands")) // post-burst banner line
      stream.write("\x1b") // esc returns to the regular app (about retypes)
      await collectUntil(stream, backOnAbout)
    } finally {
      client.end()
    }
  },
  15000,
)

test(
  "a backtick typed in guestbook compose is text, not the console trigger",
  async () => {
    const client = await connect()
    try {
      const stream = await shell(client)
      await collectUntil(stream, (s) => containsCI(s, identity.name))
      stream.write("b")
      await collectUntil(stream, (s) => containsCI(s, "guestbook"))
      stream.write("n")
      await collectUntil(stream, (s) => containsCI(s, "name (optional)"))
      // the backtick must land in the name field (no submit — stays
      // rate-limit-free) and must NOT swap the frame for the console
      stream.write("tick`tock")
      const all = await collectUntil(stream, (s) => containsCI(stripAnsi(s), "tick`tock"))
      expect(typedMatch("guest shell")(all)).toBe(false)
    } finally {
      client.end()
    }
  },
  15000,
)

test("exec requests are rejected", async () => {
  const client = await connect()
  try {
    const output = await new Promise<string>((resolve, reject) => {
      client.exec("ls", (err, stream) => {
        if (err) return reject(err)
        let all = ""
        stream.on("data", (d: Buffer) => (all += d.toString("utf8")))
        stream.on("close", () => resolve(all))
      })
    })
    expect(output).toContain("interactive TUI")
  } finally {
    client.end()
  }
})

test(
  "presence count live-updates across sessions and drops on disconnect",
  async () => {
    const watcher = await connect()
    try {
      const watcherStream = await shell(watcher)
      await collectUntil(watcherStream, (s) => containsCI(s, identity.name))

      // Attach the predicate BEFORE the second session exists — the About
      // line inserts " · 2 ONLINE" mid-string, so the shifted tail streams
      // contiguously (see the diff-render NOTE above).
      const sawTwo = collectUntil(watcherStream, (s) => containsCI(stripAnsi(s), "2 ONLINE"))
      const second = await connect()
      const secondStream = await shell(second)
      await collectUntil(secondStream, (s) => containsCI(s, identity.name))
      await sawTwo

      // Drop the second session; a third connect must land back on 2, not
      // 3 — proving leave() paired with the disconnect.
      second.end()
      await Bun.sleep(500)
      const sawTwoAgain = collectUntil(watcherStream, (s) => {
        const tail = stripAnsi(s)
        return tail.includes("2 ONLINE") && !tail.includes("3 ONLINE")
      })
      const third = await connect()
      const thirdStream = await shell(third)
      await collectUntil(thirdStream, (s) => containsCI(s, identity.name))
      await sawTwoAgain
      third.end()
    } finally {
      watcher.end()
    }
  },
  20000,
)
