import { TextAttributes, type ASCIIFontName } from "@opentui/core"
import { identity } from "../content"
import { useLetterFlicker } from "../hooks/useLetterFlicker"
import { LRNZO_FONT } from "../lrnzoFont"
import { useTheme } from "../theme"
import { PulseStar } from "./PulseStar"

// One ascii-font per letter so each can cut out independently (the element's
// color array maps to font color LAYERS, not letters). An unlit letter drops
// to opacity 0 — composited out natively, so it vanishes into whatever
// background the terminal actually has while yoga still reserves its cells.
// A sparking letter paints in the theme accent until it settles to fg.
// gap={2} reproduces the font's letterspace_size, which single-letter
// elements no longer emit.
function FlickerBanner() {
  const theme = useTheme()
  const letters = identity.banner.split("")
  // Keyed on the theme: switching re-runs the entrance, letters scattering
  // back in painted with the incoming accent while the glitch burst plays.
  const states = useLetterFlicker(letters.length, theme.name)
  return (
    <box flexDirection="row" gap={2}>
      {letters.map((ch, i) => (
        <ascii-font
          key={i}
          text={ch}
          font={LRNZO_FONT as ASCIIFontName}
          color={states[i] === "flicker" ? theme.accent : theme.fg}
          opacity={states[i] === "off" ? 0 : 1}
        />
      ))}
    </box>
  )
}

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
        <FlickerBanner />
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
