import { TextAttributes, type ASCIIFontName } from "@opentui/core"
import { identity } from "../content"
import { LRNZO_FONT } from "../lrnzoFont"
import { useTheme } from "../theme"
import { PulseStar } from "./PulseStar"

// Brutalist masthead: big ascii name with an accent ".END" suffix, dim caps
// identity line, and registration-mark micro-labels on the right. The star
// pulses on an idle heartbeat and whenever `pulseKey` (active tab) changes.
export function Header({ compact, pulseKey }: { compact: boolean; pulseKey?: unknown }) {
  const theme = useTheme()

  if (compact) {
    return (
      <box flexDirection="row" width="100%" height={1}>
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
    <box flexDirection="column" width="100%">
      <box flexDirection="row" alignItems="flex-end">
        <ascii-font text={identity.banner} font={LRNZO_FONT as ASCIIFontName} color={theme.fg} />
        <text fg={theme.accent}>.END</text>
      </box>
      <box flexDirection="row" width="100%" marginTop={1}>
        <text fg={theme.dim}>
          {identity.name.toUpperCase()} — {identity.tagline.toUpperCase()}
        </text>
        <box flexGrow={1} />
        <text>
          <span fg={theme.dim}>N1 N2 N3 </span>
          <PulseStar pulseKey={pulseKey} />
          <span fg={theme.dim}> {identity.host.toUpperCase()}</span>
        </text>
      </box>
    </box>
  )
}
