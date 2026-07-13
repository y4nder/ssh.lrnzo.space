// Dev helper: boot the server on a scratch port, drive it with an ssh2
// client, and print the terminal grid after a key sequence — a poor man's
// screenshot for eyeballing layout without an interactive terminal.
// Usage: bun scripts/frame-dump.ts [keys...]   e.g. bun scripts/frame-dump.ts r G
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Client, type ClientChannel } from "ssh2"

const COLS = Number(process.env.DUMP_COLS || 100)
const ROWS = Number(process.env.DUMP_ROWS || 34)
const keys = process.argv.slice(2)

// Minimal ANSI screen emulator: cursor-position + text; everything else dropped.
function emulate(data: string): string[] {
  const grid: string[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(" "))
  let row = 0
  let col = 0
  let i = 0
  while (i < data.length) {
    const ch = data[i]!
    if (ch === "\x1b") {
      const m = /^\x1b\[([0-9;?]*)([A-Za-z])/.exec(data.slice(i))
      if (m) {
        const [full, params, cmd] = [m[0], m[1]!, m[2]!]
        if (cmd === "H") {
          const [r, c] = params.split(";").map((n) => parseInt(n || "1", 10))
          row = (r || 1) - 1
          col = (c || 1) - 1
        }
        i += full.length
        continue
      }
      i++
      continue
    }
    if (ch === "\r") col = 0
    else if (ch === "\n") row++
    else if (row < ROWS && col < COLS) {
      grid[row]![col] = ch
      col++
    } else col++
    i++
  }
  return grid.map((r) => r.join("").trimEnd())
}

const tmpDir = mkdtempSync(join(tmpdir(), "ssh-portfolio-dump-"))
const keyPath = join(tmpDir, "host_key")
Bun.spawnSync(["ssh-keygen", "-t", "ed25519", "-f", keyPath, "-N", "", "-q"])
const PORT = 2298
const server = Bun.spawn(["bun", "src/server.ts"], {
  env: { ...process.env, PORT: String(PORT), BIND: "127.0.0.1", HOST_KEY_PATH: keyPath },
  stdout: "pipe",
})
const reader = (server.stdout as ReadableStream<Uint8Array>).getReader()
let boot = ""
while (!boot.includes("listening")) {
  const { value, done } = await reader.read()
  if (done) break
  boot += new TextDecoder().decode(value)
}
reader.releaseLock()

const client = await new Promise<Client>((resolve, reject) => {
  const c = new Client()
  c.on("ready", () => resolve(c))
  c.on("error", reject)
  c.connect({ host: "127.0.0.1", port: PORT, username: "dump", password: "x" })
})
const stream = await new Promise<ClientChannel>((resolve, reject) => {
  client.shell({ term: "xterm-256color", cols: COLS, rows: ROWS }, (err, s) =>
    err ? reject(err) : resolve(s),
  )
})

let all = ""
stream.on("data", (d: Buffer) => (all += d.toString("utf8")))
await Bun.sleep(3000) // splash auto-advances
for (const k of keys) {
  stream.write(k)
  await Bun.sleep(400)
}
await Bun.sleep(600)

console.log(emulate(all).join("\n"))
client.end()
server.kill()
rmSync(tmpDir, { recursive: true, force: true })
process.exit(0)
