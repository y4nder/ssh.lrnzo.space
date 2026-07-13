import { readFileSync } from "node:fs"
import { Server, type Connection } from "ssh2"
import { createSession, type SessionHandle } from "./session"

const PORT = Number(process.env.PORT ?? 2222)
const BIND = process.env.BIND ?? "0.0.0.0"
const HOST_KEY_PATH = process.env.HOST_KEY_PATH ?? "keys/host_key"
const MAX_SESSIONS = Number(process.env.MAX_SESSIONS ?? 30)
const IDLE_TIMEOUT_MS = Number(process.env.IDLE_TIMEOUT_MS ?? 10 * 60 * 1000)
const HANDSHAKE_TIMEOUT_MS = 30_000

const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`)

let activeSessions = 0
const clients = new Set<Connection>()

const server = new Server(
  {
    hostKeys: [readFileSync(HOST_KEY_PATH)],
    ident: "SSH-2.0-ssh_portfolio",
  },
  (client, info) => {
    const ip = info.ip
    log(`connect ${ip}`)
    clients.add(client)

    // drop clients that stall before completing auth
    const handshakeTimer = setTimeout(() => {
      log(`handshake timeout ${ip}`)
      client.end()
    }, HANDSHAKE_TIMEOUT_MS)

    // visitors are anonymous: accept every auth attempt, inspect nothing
    client.on("authentication", (ctx) => ctx.accept())

    // abrupt disconnects (network drop, killed client) can close the
    // connection without the channel ever emitting 'close' — these cleanups
    // are the fallback that keeps the session counter and renderers honest
    const sessionCleanups = new Set<() => void>()

    client.on("ready", () => {
      clearTimeout(handshakeTimer)

      client.on("session", (acceptSession) => {
        const session = acceptSession()
        let pty: { cols: number; rows: number } | null = null
        let handle: SessionHandle | null = null
        let idleTimer: ReturnType<typeof setTimeout> | null = null

        session.on("pty", (accept, _reject, ptyInfo) => {
          pty = { cols: ptyInfo.cols || 80, rows: ptyInfo.rows || 24 }
          accept?.()
        })

        session.on("window-change", (accept, _reject, dims) => {
          handle?.resize(dims.cols, dims.rows)
          accept?.()
        })

        // `ssh host somecommand` — not something this server does
        session.on("exec", (accept) => {
          const channel = accept()
          channel.write("This server only serves an interactive TUI. Connect without a command.\r\n")
          channel.exit(1)
          channel.end()
        })

        session.on("sftp", (_accept, reject) => reject?.())
        session.on("subsystem", (_accept, reject) => reject?.())

        session.on("shell", (accept) => {
          const channel = accept()

          if (!pty) {
            channel.write("An interactive terminal is required (no PTY was requested).\r\n")
            channel.exit(1)
            channel.end()
            return
          }
          if (activeSessions >= MAX_SESSIONS) {
            channel.write("Too many visitors right now — please try again in a minute.\r\n")
            channel.exit(1)
            channel.end()
            return
          }

          activeSessions++
          log(`session open ${ip} (${activeSessions} active)`)

          let cleaned = false
          const cleanup = () => {
            if (cleaned) return
            cleaned = true
            sessionCleanups.delete(cleanup)
            if (idleTimer) clearTimeout(idleTimer)
            handle?.destroy()
            activeSessions--
            log(`session close ${ip} (${activeSessions} active)`)
          }
          sessionCleanups.add(cleanup)

          const armIdleTimer = () => {
            if (idleTimer) clearTimeout(idleTimer)
            idleTimer = setTimeout(() => {
              log(`idle timeout ${ip}`)
              cleanup()
            }, IDLE_TIMEOUT_MS)
          }
          channel.on("data", armIdleTimer)
          armIdleTimer()

          channel.on("close", cleanup)

          createSession(channel, pty, log)
            .then((h) => {
              handle = h
              // the client may have vanished while the renderer was starting
              if (cleaned) h.destroy()
            })
            .catch((err) => {
              log(`session start failed ${ip}: ${err}`)
              try {
                channel.exit(1)
                channel.end()
              } catch {}
            })
        })
      })
    })

    client.on("error", (err) => log(`client error ${ip}: ${err.message}`))
    client.on("close", () => {
      clearTimeout(handshakeTimer)
      clients.delete(client)
      for (const cleanup of [...sessionCleanups]) cleanup()
      log(`disconnect ${ip}`)
    })
  },
)

server.listen(PORT, BIND, () => {
  log(`ssh_portfolio listening on ${BIND}:${PORT} (max ${MAX_SESSIONS} sessions)`)
})

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    log(`${signal} received, shutting down`)
    server.close()
    for (const client of clients) client.end()
    // give channels a moment to flush their goodbyes
    setTimeout(() => process.exit(0), 500).unref()
    if (clients.size === 0) process.exit(0)
  })
}
