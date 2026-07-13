import { useTheme } from "../theme"
import { useTick } from "../hooks/useTick"

// Blinking block cursor. Rendered as a <span>, so it must live inside <text>.
export function Cursor({ blink = true }: { blink?: boolean }) {
  const theme = useTheme()
  const tick = useTick(400, blink)
  const on = !blink || tick % 2 === 0
  return <span fg={theme.accent}>{on ? "▮" : " "}</span>
}
