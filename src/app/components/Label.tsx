import { useTheme } from "../theme"

// Brutalist micro-caps metadata label ("N1", "STAY CONNECTED", dates).
export function Label({ text, accent = false }: { text: string; accent?: boolean }) {
  const theme = useTheme()
  return (
    <text flexShrink={0} fg={accent ? theme.accent : theme.dim}>
      {text.toUpperCase()}
    </text>
  )
}
