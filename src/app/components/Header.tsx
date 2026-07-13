import { TextAttributes } from "@opentui/core"
import { identity } from "../content"
import { useTheme } from "../theme"

// Brutalist masthead: big ascii name with an accent ".END" suffix, dim caps
// identity line, and registration-mark micro-labels on the right.
export function Header({ compact }: { compact: boolean }) {
  const theme = useTheme()

  if (compact) {
    return (
      <box flexDirection="row" width="100%" height={1} flexShrink={0}>
        <text>
          <span fg={theme.fg} attributes={TextAttributes.BOLD}>
            {identity.name.toUpperCase()}
          </span>
          <span fg={theme.accent}>.END</span>
        </text>
        <box flexGrow={1} />
        <text fg={theme.dim}>{identity.tagline.toUpperCase()}</text>
      </box>
    )
  }

  return (
    <box flexDirection="column" width="100%" flexShrink={0}>
      <box flexDirection="row" alignItems="flex-end">
        <ascii-font text={identity.banner} font="block" color={theme.fg} />
        <text fg={theme.accent}>.END</text>
      </box>
      <box flexDirection="row" width="100%">
        <text fg={theme.dim}>
          {identity.name.toUpperCase()} — {identity.tagline.toUpperCase()}
        </text>
        <box flexGrow={1} />
        <text>
          <span fg={theme.dim}>N1 N2 N3 </span>
          <span fg={theme.accent}>✳ </span>
          <span fg={theme.dim}>{identity.host.toUpperCase()}</span>
        </text>
      </box>
    </box>
  )
}
