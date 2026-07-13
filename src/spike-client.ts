// Throwaway spike client: connects, requests a PTY, then resizes the window
// to verify the server drives renderer.resize() and re-renders at the new size.
import { Client } from "ssh2"

const client = new Client()
let bytes = 0
let sawWideFrame = false

client.on("ready", () => {
  client.shell({ term: "xterm-256color", cols: 80, rows: 24 }, (err, stream) => {
    if (err) throw err
    let afterResize = false
    let bytesAfterResize = 0
    stream.on("data", (d: Buffer) => {
      bytes += d.length
      if (afterResize) {
        bytesAfterResize += d.length
        // after resize to 120 cols, border rows should contain runs of ─ longer
        // than the original 80-col frame could hold
        if (/─{100,}/.test(d.toString("utf8"))) sawWideFrame = true
      }
    })
    setTimeout(() => {
      console.log(`initial frame received: ${bytes} bytes`)
      afterResize = true
      stream.setWindow(40, 120, 0, 0) // rows, cols
    }, 1500)
    setTimeout(() => {
      console.log(`bytes after resize: ${bytesAfterResize}`)
    }, 3400)
    setTimeout(() => {
      console.log(`after resize: wide-frame cells seen = ${sawWideFrame}`)
      client.end()
      process.exit(sawWideFrame ? 0 : 1)
    }, 3500)
  })
})

client.on("error", (e) => {
  console.error("client error:", e.message)
  process.exit(2)
})

client.connect({
  host: "127.0.0.1",
  port: 2222,
  username: "resize-test",
  password: "x",
  debug: (msg: string) => {
    if (/window-change|CHANNEL_REQUEST/i.test(msg)) console.log("[debug]", msg)
  },
})
