import type { ServerChannel } from "ssh2"

// OpenTUI expects TTY-shaped streams (NodeJS.ReadStream/WriteStream). The ssh2
// session channel is a plain Duplex, so the TTY surface is grafted on. The
// same decorated channel serves as both stdin and stdout for the renderer.
export type TtyChannel = ServerChannel & {
  isTTY: true
  columns: number
  rows: number
  setRawMode: (mode: boolean) => TtyChannel
}

export function asTtyChannel(channel: ServerChannel, cols: number, rows: number): TtyChannel {
  const stream = channel as TtyChannel
  stream.isTTY = true
  stream.columns = cols
  stream.rows = rows
  stream.setRawMode = () => stream
  return stream
}
