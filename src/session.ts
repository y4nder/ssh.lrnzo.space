import { createCliRenderer, type CliRenderer } from "@opentui/core"
import { createRoot, type Root } from "@opentui/react"
import type { ServerChannel } from "ssh2"
import { createElement } from "react"
import { App } from "./app/App"
import { asTtyChannel } from "./tty-stream"

export type SessionHandle = {
  resize: (cols: number, rows: number) => void
  destroy: () => void
}

export async function createSession(
  channel: ServerChannel,
  pty: { cols: number; rows: number },
  onLog: (msg: string) => void,
  meta: { ip: string; visitorNumber: number },
): Promise<SessionHandle> {
  const stream = asTtyChannel(channel, pty.cols, pty.rows)

  const renderer: CliRenderer = await createCliRenderer({
    stdin: stream as unknown as NodeJS.ReadStream,
    stdout: stream as unknown as NodeJS.WriteStream,
    width: pty.cols,
    height: pty.rows,
    exitOnCtrlC: false,
    exitSignals: [],
    // without this every renderer hijacks the global console for its overlay
    consoleMode: "disabled",
  })

  let destroyed = false
  let root: Root | null = null

  const destroy = () => {
    if (destroyed) return
    destroyed = true
    try {
      root?.unmount()
    } catch (err) {
      onLog(`unmount error: ${err}`)
    }
    try {
      renderer.destroy()
    } catch (err) {
      onLog(`renderer destroy error: ${err}`)
    }
  }

  const exit = () => {
    destroy()
    // give the client a clean exit status so `ssh` returns 0
    try {
      channel.exit(0)
      channel.end()
    } catch {}
  }

  root = createRoot(renderer)
  root.render(createElement(App, { onExit: exit, ip: meta.ip, visitorNumber: meta.visitorNumber }))

  channel.on("close", destroy)
  channel.on("error", destroy)

  return {
    resize: (cols, rows) => {
      if (destroyed) return
      stream.columns = cols
      stream.rows = rows
      renderer.resize(cols, rows)
    },
    destroy: exit,
  }
}
