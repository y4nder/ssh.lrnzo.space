// Phase 0 spike: prove ssh2 + OpenTUI custom-stream rendering work together
// under this runtime. Run with: bun src/spike.tsx, then: ssh -p 2222 localhost
import { readFileSync } from "node:fs"
import { Server, type ServerChannel } from "ssh2"
import { createCliRenderer, type CliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"

const PORT = 2222
const HOST_KEY = readFileSync("keys/host_key")

function Hello({ user }: { user: string }) {
  return (
    <box
      border
      borderStyle="rounded"
      padding={2}
      flexDirection="column"
      alignItems="center"
    >
      <text fg="#7aa2f7">ssh_portfolio — spike</text>
      <text>hello {user}, rendered by OpenTUI over ssh2</text>
      <text fg="#565f89">press q or ctrl+c to disconnect</text>
    </box>
  )
}

type PtyInfo = { cols: number; rows: number; term: string }

async function startSession(channel: ServerChannel, pty: PtyInfo, user: string) {
  // OpenTUI expects TTY-shaped streams; the ssh2 channel is a plain Duplex,
  // so it needs isTTY/columns/rows/setRawMode grafted on.
  const stream = channel as any
  stream.isTTY = true
  stream.columns = pty.cols
  stream.rows = pty.rows
  stream.setRawMode = () => stream

  const renderer: CliRenderer = await createCliRenderer({
    stdin: stream,
    stdout: stream,
    width: pty.cols,
    height: pty.rows,
    exitOnCtrlC: false,
    exitSignals: [],
    // without this, each renderer hijacks global console.log for its overlay
    consoleMode: "disabled",
  })

  const root = createRoot(renderer)
  root.render(<Hello user={user} />)

  const shutdown = () => {
    try {
      root.unmount()
      renderer.destroy()
    } catch {}
    channel.end()
  }

  renderer.keyInput.on("keypress", (key: { name?: string; ctrl?: boolean }) => {
    if (key.name === "q" || (key.ctrl && key.name === "c")) shutdown()
  })
  channel.on("close", () => {
    try {
      root.unmount()
      renderer.destroy()
    } catch {}
  })

  return { renderer, stream }
}

const server = new Server({ hostKeys: [HOST_KEY] }, (client) => {
  console.log("client connected")
  let user = "visitor"

  client.on("authentication", (ctx) => {
    user = ctx.username || "visitor"
    ctx.accept()
  })

  client.on("ready", () => {
    client.on("session", (acceptSession) => {
      const session = acceptSession()
      let pty: PtyInfo | null = null
      let active: { renderer: CliRenderer; stream: any } | null = null

      session.on("pty", (accept, _reject, info) => {
        pty = { cols: info.cols, rows: info.rows, term: info.term }
        accept?.()
      })

      session.on("window-change", (accept, _reject, info) => {
        console.log(`window-change: ${info.cols}x${info.rows} (active=${!!active})`)
        if (active) {
          active.stream.columns = info.cols
          active.stream.rows = info.rows
          active.renderer.resize(info.cols, info.rows)
        }
        accept?.()
      })

      session.on("shell", (accept) => {
        const channel = accept()
        if (!pty) {
          channel.write("This server only serves an interactive TUI.\r\n")
          channel.end()
          return
        }
        startSession(channel, pty, user)
          .then((s) => {
            active = s
          })
          .catch((err) => {
            console.error("session failed:", err)
            channel.end()
          })
      })
    })
  })

  client.on("error", (err) => console.error("client error:", err.message))
  client.on("close", () => console.log("client disconnected"))
})

server.listen(PORT, "127.0.0.1", () => {
  console.log(`spike listening — try: ssh -p ${PORT} localhost`)
})
