import { TextAttributes } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"
import { useEffect, useMemo, useState } from "react"
import { clock, positionMs } from "../../nowplaying"
import { identity } from "../content"
import { useFlashIn } from "../hooks/useFlashIn"
import { useInkPasses } from "../hooks/useInkPasses"
import { useNowPlaying } from "../hooks/useNowPlaying"
import { useTick } from "../hooks/useTick"
import {
  artSpans,
  musicLayout,
  printedSpans,
  type Span,
  timecode,
  titleWindow,
  wavePlayed,
  waveform,
} from "../music"
import { QUIET, qrForUrl } from "../qr"
import { useTheme } from "../theme"
import { center } from "../util"
import { Rule } from "./Rule"
import { StatusBar } from "./StatusBar"

const COPIED_MS = 1500
const MARQUEE_TICK_MS = 250

function clip(text: string, width: number): string {
  if (width <= 0) return ""
  return text.length <= width ? text : `${text.slice(0, Math.max(0, width - 1))}…`
}

/**
 * The `m` takeover, built as a Spotify-Code card: cover centred, its signature
 * wave strip fused to the bottom edge so the two read as one object, then the
 * track centred beneath it. `c` flips the cover for a scannable QR of the
 * track — the one thing this readout does better than the website it borrows
 * its data from.
 *
 * The art is drawn as COLOURED RUNS of one <text> per row — the cover's own
 * three inks (see albumArt.ts) — never as per-cell half-blocks. Half-blocks
 * would need an fg and a bg truecolour escape for every cell, and painting a
 * background in every cell would break theme.ts's contract of deferring to the
 * visitor's own terminal background.
 *
 * Three flat inks is what makes the colour affordable at all. Measured on a
 * real 300px cover at 40x20 cells, down one SSH channel per repaint:
 *
 *   flat accent (what this used to be)      20 escapes   ~2.7KB
 *   three inks, run-length collapsed       103 escapes   ~4.3KB
 *   truecolour per cell                    660 escapes  ~14.6KB
 *
 * Sleeves are mostly large flat regions, so the runs collapse to ~2-3 spans per
 * row rather than one per column. That is the whole argument for K=3.
 *
 * THE COVER DELIBERATELY DOES NOT FOLLOW `t`. It is the one true-colour object
 * on the site; everything around it — wave strip, title, QR, chrome — stays on
 * theme.accent, which is what keeps the page reading as this app rather than as
 * a photo viewer. A cover whose palette failed to extract falls back to the
 * accent and looks exactly like this page did before colour.
 *
 * NOTHING HERE USES theme.faint FOR TEXT. It is a structural token (~#242a33
 * on circuit) meant for placeholder fill; text painted in it is invisible on a
 * dark terminal, which is exactly what it looked like.
 */
export function MusicPage({
  width,
  height,
  onClose,
  onExit,
  onToggleTheme,
}: {
  width: number
  height: number
  onClose: () => void
  onExit: () => void
  onToggleTheme: () => void
}) {
  const theme = useTheme()
  const renderer = useRenderer()
  const snap = useNowPlaying()
  const [copied, setCopied] = useState<boolean | null>(null)
  const [showCode, setShowCode] = useState(false)

  const playing = snap?.data.isPlaying === true
  useTick(1000, playing)

  const track = snap?.data.track ?? null
  const url = track?.url ?? ""

  // Keyed on the URL so a track change regenerates it, and nothing else does.
  const qr = useMemo(() => (url ? qrForUrl(url, "SCAN · TRACK") : null), [url])
  const layout = musicLayout(width, height, qr)
  const art = useMemo(
    () => artSpans(snap?.art ?? null, layout.artCols, layout.artRows),
    [snap?.art, layout.artCols, layout.artRows],
  )

  // A frame that lost the room for the QR must not be stuck showing it.
  const code = showCode && layout.qrAvailable && qr !== null
  const inkCount = snap?.art?.palette.length ?? 0

  useKeyboard((key) => {
    if (key.eventType === "release") return
    // `q` quits the session on every page in this app; the music page is not
    // the one exception.
    if (key.name === "q" || (key.ctrl && key.name === "c")) return onExit()
    if (key.name === "escape" || key.name === "backspace" || key.name === "m") return onClose()
    if (key.name === "t") return onToggleTheme()
    if (key.name === "c" && layout.qrAvailable) return setShowCode((s) => !s)
    if (key.name === "y" && url) setCopied(renderer.copyToClipboardOSC52(url))
  })

  useEffect(() => {
    if (copied === null) return
    // One process serves every session — a leaked timer would keep firing
    // setState long after this visitor disconnected.
    const timer = setTimeout(() => setCopied(null), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const position = snap ? positionMs(snap, clock()) : null
  const ratio = track && position !== null ? position / track.durationMs : 0

  // The slot is pre-sized to the taller of cover and QR, so `c` never reflows
  // the card. Both are centred inside cardWidth for the same reason.
  // ENTRANCE. The cover registers ink by ink; the QR, being one flat block,
  // strobes instead — the same reveal the contact page's QR uses. Both replay
  // on a flip, on a theme switch, and on the art finally landing (the jpeg
  // arrives on a later publish than the track, so without this the cover pops
  // in on its own schedule).
  const reveal = `${url}|${theme.name}|${snap?.art == null ? "wait" : "art"}|${code ? "qr" : "art"}`
  const passes = useInkPasses(inkCount, reveal)
  const flash = useFlashIn(code, reveal)

  // A QR is one flat accent block by necessity — it stops scanning without the
  // contrast — so its rows carry no colour of their own.
  const slot: Span[][] =
    code && qr
      ? // Blanked with spaces, never dropped: the dark half of a strobe still
        // has to occupy the row, or the card twitches at 60ms intervals.
        qr.rows.map((text) => [
          { text: flash === "hidden" || flash === "off" ? " ".repeat(text.length) : text, color: null, ink: null },
        ])
      : printedSpans(art, passes)
  const slotWidth = code && qr ? qr.width : layout.artCols
  const slotPad = Math.max(0, Math.floor((layout.cardWidth - slotWidth) / 2))
  const topPad = Math.max(0, Math.floor((layout.slotRows - slot.length) / 2))

  // The NO COVER placeholder recedes rather than shouting — a full block of
  // accent for a release that simply has no artwork reads as an error.
  const slotColor = code || snap?.art != null ? theme.accent : theme.dim

  // The strip is fused to whichever block is on show, so it matches that
  // block's VISIBLE edges — not the card's, and not the QR's bounding box. A
  // QR's rows begin with QUIET blank columns of required quiet zone, so a strip
  // sized to the box would stick out both sides and stop reading as an edge.
  const waveWidth = Math.max(0, code ? slotWidth - QUIET * 2 : slotWidth)
  const waveIndent = slotPad + (code ? QUIET : 0)
  const wave = track ? waveform(track.url, waveWidth) : ""
  // Progress moves this boundary; the bars themselves never move.
  const waveCut = playing ? wavePlayed(ratio, waveWidth) : 0

  const titleTick = useTick(
    MARQUEE_TICK_MS,
    track !== null && track.title.length > layout.cardWidth,
  )

  const hints = [
    ...(layout.qrAvailable ? [{ key: "c", label: code ? "cover" : "code" }] : []),
    ...(url ? [{ key: "y", label: "copy link" }] : []),
    { key: "esc", label: "back" },
    { key: "t", label: "theme" },
    { key: "q", label: "quit" },
  ]

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexDirection="row" width="100%" height={1} flexShrink={0}>
        <text flexShrink={1} fg={theme.fg} attributes={TextAttributes.BOLD}>
          {playing ? "NOW PLAYING" : "LAST PLAYED"}
        </text>
        <text flexShrink={0} fg={theme.accent}> ✱</text>
        <box flexGrow={1} minWidth={1} />
        <text flexShrink={0} fg={theme.dim}>
          {code ? "SPOTIFY CODE" : "SPOTIFY"}
        </text>
      </box>

      <Rule heavy width={width} />

      {track === null ? (
        // Never auto-unmount: yanking the frame out from under a visitor who
        // is reading it is worse than showing that the feed went quiet.
        <box flexGrow={1} justifyContent="center" alignItems="center">
          <text fg={theme.dim}>SIGNAL LOST</text>
        </box>
      ) : (
        <>
          {/* Slack split above and below so the card sits centred between the
              rules. Both collapse on a frame with no room to spare. */}
          <box flexGrow={1} minHeight={0} />

          <box flexDirection="column" alignItems="center" flexShrink={0}>
            <box flexDirection="column" width={layout.cardWidth} flexShrink={0}>
              {Array.from({ length: topPad }, (_, i) => (
                <text key={`pad${i}`} height={1} flexShrink={0}>
                  {" "}
                </text>
              ))}
              {slot.map((row, i) => (
                <text key={i} height={1} flexShrink={0}>
                  <span>{" ".repeat(slotPad)}</span>
                  {row.map((span, j) => (
                    <span key={j} fg={span.color ?? slotColor}>
                      {span.text}
                    </span>
                  ))}
                </text>
              ))}
              {Array.from({ length: layout.slotRows - slot.length - topPad }, (_, i) => (
                <text key={`tail${i}`} height={1} flexShrink={0}>
                  {" "}
                </text>
              ))}

              {/* Fused to the block's bottom edge, same width and indent. */}
              <text height={1} flexShrink={0}>
                <span>{" ".repeat(waveIndent)}</span>
                <span fg={theme.accent}>{wave.slice(0, waveCut)}</span>
                <span fg={theme.dim}>{wave.slice(waveCut)}</span>
              </text>

              {layout.showSpacers ? (
                <text height={1} flexShrink={0}>
                  {" "}
                </text>
              ) : null}

              <text height={1} flexShrink={0} fg={theme.fg} attributes={TextAttributes.BOLD}>
                {titleWindow(track.title, layout.cardWidth, titleTick)}
              </text>
              <text height={1} flexShrink={0} fg={theme.accent}>
                {center(clip(track.artist, layout.cardWidth), layout.cardWidth)}
              </text>
              {layout.showAlbum ? (
                <text height={1} flexShrink={0} fg={theme.dim}>
                  {center(clip(track.album, layout.cardWidth), layout.cardWidth)}
                </text>
              ) : null}

              {layout.showSpacers ? (
                <text height={1} flexShrink={0}>
                  {" "}
                </text>
              ) : null}

              {layout.showTime ? (
                <text height={1} flexShrink={0} fg={theme.dim}>
                  {center(
                    playing
                      ? `${timecode(position ?? 0)} / ${timecode(track.durationMs)}`
                      : "ENDED",
                    layout.cardWidth,
                  )}
                </text>
              ) : null}
            </box>
          </box>

          <box flexGrow={1} minHeight={0} />
        </>
      )}

      <Rule width={width} />
      <StatusBar
        hints={hints}
        right={copied === null ? `${identity.banner}.fm ✱` : copied ? "■ COPIED" : "■ COPY FAILED"}
      />
    </box>
  )
}
