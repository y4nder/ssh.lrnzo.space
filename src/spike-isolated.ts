// Isolated test: does ssh2's server emit 'window-change' under this runtime?
import { readFileSync } from "node:fs"
import { Server, Client } from "ssh2"

const server = new Server({ hostKeys: [readFileSync("keys/host_key")] }, (client) => {
  client.on("authentication", (ctx) => ctx.accept())
  client.on("ready", () => {
    client.on("session", (accept) => {
      const session = accept()
      session.on("pty", (a) => a?.())
      session.on("window-change", (a, r, info) => {
        console.log(`SERVER got window-change: ${info.cols}x${info.rows}`)
        a?.()
        process.exit(0)
      })
      session.on("shell", (accept) => {
        const ch = accept()
        ch.write("hi\r\n")
      })
    })
  })
})

server.listen(2299, "127.0.0.1", () => {
  const c = new Client()
  c.on("ready", () => {
    c.shell({ term: "xterm", cols: 80, rows: 24 }, (err, stream) => {
      if (err) throw err
      setTimeout(() => stream.setWindow(40, 120, 0, 0), 500)
    })
  })
  c.connect({ host: "127.0.0.1", port: 2299, username: "t", password: "x" })
})

setTimeout(() => {
  console.log("TIMEOUT: window-change never emitted")
  process.exit(1)
}, 5000)
