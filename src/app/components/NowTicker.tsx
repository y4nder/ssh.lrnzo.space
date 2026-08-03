import { clock, positionMs } from "../../nowplaying"
import { useNowPlaying } from "../hooks/useNowPlaying"
import { useTick } from "../hooks/useTick"
import {
  marqueeWindow,
  TICKER_HINT_KEY,
  TICKER_HINT_LABEL,
  tickerParts,
  timecode,
  wavePlayed,
  waveform,
} from "../music"
import { useTheme } from "../theme"

/**
 * The live band above the status bar: what is playing, how far in, and the key
 * that opens the full page.
 *
 * Every timer in this feature lives HERE rather than in App — a tick up there
 * would repaint the masthead, tabs and typewriters four times a second for
 * every connected session. Both intervals are gated: the meter only runs while
 * something is actually playing, the marquee only while the title overflows.
 *
 * Title and artist keep their original case. They are data, like guestbook
 * message bodies — uppercasing "Dear Child (I've Been Dying to Reach You)"
 * destroys the typography the artist chose.
 */
export function NowTicker({ width }: { width: number }) {
  const theme = useTheme()
  const snap = useNowPlaying()

  const playing = snap?.data.isPlaying === true
  // Position is derived at render from the shared snapshot, never stored — the
  // tick exists only to schedule the re-render.
  useTick(1000, playing)

  const track = snap?.data.track
  const position = snap ? positionMs(snap, clock()) : null
  const text = track ? `${track.title} — ${track.artist}` : ""

  const timeText =
    playing && track && position !== null
      ? `${timecode(position)}/${timecode(track.durationMs)}`
      : ""
  const parts = tickerParts(width, playing, timeText)
  const marqueeTick = useTick(250, text.length > parts.marqueeWidth)

  if (!track) return null

  const label = playing ? "NOW" : "LAST"
  // The strip's SHAPE is a constant signature of the track; progress moves the
  // colour boundary through it, never the bars themselves.
  const wave = parts.waveWidth > 0 ? waveform(track.url, parts.waveWidth) : ""
  const cut = wavePlayed((position ?? 0) / track.durationMs, parts.waveWidth)

  return (
    <text height={1} flexShrink={0}>
      <span fg={theme.accent}>{label}</span>
      <span fg={theme.dim}> ▸ </span>
      <span fg={theme.fg}>{marqueeWindow(text, parts.marqueeWidth, marqueeTick)}</span>
      {parts.waveWidth > 0 ? (
        <span>
          <span>{"  "}</span>
          <span fg={theme.accent}>{wave.slice(0, cut)}</span>
          {/* dim, not faint: faint is ~#242a33 and the unplayed tail would
              vanish, leaving the played run looking like a stray fragment. */}
          <span fg={theme.dim}>{wave.slice(cut)}</span>
        </span>
      ) : null}
      {parts.timeText ? (
        <span fg={theme.dim}>
          {"  "}
          {parts.timeText}
        </span>
      ) : null}
      {parts.showHint ? (
        <span>
          <span>{"  "}</span>
          <span fg={theme.accent}>{TICKER_HINT_KEY}</span>
          <span fg={theme.dim}>{TICKER_HINT_LABEL}</span>
        </span>
      ) : null}
    </text>
  )
}
