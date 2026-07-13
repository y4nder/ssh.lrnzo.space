import { useTheme } from "../theme"

// Full-width horizontal rule — the only "border" this design allows.
// `width` is the centered frame's column count, not the terminal's.
export function Rule({
  width,
  heavy = false,
  accent = false,
}: {
  width: number
  heavy?: boolean
  accent?: boolean
}) {
  const theme = useTheme()
  const char = heavy ? "━" : "─"
  return (
    <text flexShrink={0} fg={accent ? theme.accent : theme.faint}>
      {char.repeat(Math.max(1, width))}
    </text>
  )
}
