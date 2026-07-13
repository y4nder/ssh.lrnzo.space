import { useTheme } from "../theme"

export type Hint = { key: string; label: string }

// Bottom hint line: accent key letter + dim label, terminal.shop style.
export function StatusBar({ hints, right }: { hints: Hint[]; right?: string }) {
  const theme = useTheme()
  return (
    <box flexDirection="row" width="100%" height={1} flexShrink={0}>
      <text>
        {hints.map((h, i) => (
          <span key={h.key + h.label}>
            <span fg={theme.accent}>{h.key}</span>
            <span fg={theme.dim}>
              {" "}
              {h.label}
              {i < hints.length - 1 ? "   " : ""}
            </span>
          </span>
        ))}
      </text>
      <box flexGrow={1} />
      {right ? <text fg={theme.dim}>{right.toUpperCase()}</text> : null}
    </box>
  )
}
