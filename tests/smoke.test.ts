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
