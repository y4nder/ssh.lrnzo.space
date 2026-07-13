import { useEffect, useRef, useState } from "react"
import { useKeyboard } from "@opentui/react"
import { identity } from "../content"
import { useTheme } from "../theme"
import { Cursor } from "./Cursor"

const TYPE_MS = 70
const HOLD_MS = 900

// Connect animation: types out the host character by character behind a block
// cursor, then hands off to the main app. Any key skips; q / ctrl-c quits.
// Timers are effect-scoped — session.ts unmounts this root on SSH disconnect.
export function Splash({ onDone, onExit }: { onDone: () => void; onExit: () => void }) {
  const theme = useTheme()
  const host = identity.host
  const [shown, setShown] = useState(0)
  const typed = shown >= host.length
  const doneRef = useRef(false)

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    onDone()
  }

  useEffect(() => {
    const timer = setInterval(() => {
      setShown((n) => (n >= host.length ? n : n + 1))
    }, TYPE_MS)
    return () => clearInterval(timer)
  }, [host])

  useEffect(() => {
    if (!typed) return
    const timer = setTimeout(finish, HOLD_MS)
    return () => clearTimeout(timer)
  }, [typed])

  useKeyboard((key) => {
    if (key.eventType === "release") return
    if (key.name === "q" || (key.ctrl && key.name === "c")) {
      onExit()
      return
    }
    finish()
  })

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      backgroundColor={theme.bg}
    >
      <box flexDirection="column" width={host.length + 2}>
        <text fg={theme.fg}>
          {host.slice(0, shown)}
          <Cursor blink={typed} />
        </text>
        <text> </text>
        <text fg={theme.dim}>{typed ? "PRESS ANY KEY" : " "}</text>
      </box>
    </box>
  )
}
