import { useMemo, useState } from "react"
import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import { getStore, type DailyStats, type HourlyBucket } from "../../db"
import { identity } from "../content"
import { useTheme } from "../theme"
import { useListWindow } from "../hooks/useListWindow"
import { useTraceReveal } from "../hooks/useTraceReveal"
import { center, fitLines } from "../util"
import { Rule } from "./Rule"
import { StatusBar } from "./StatusBar"

// ═══════════════════════════════════════════════════════════════════════
// shared helpers
// ═══════════════════════════════════════════════════════════════════════

const SPARK = " ▁▂▃▄▅▆█"

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function fmtDay(day: string): string {
  return day.slice(5) // "2026-07-20" → "07/20"
}

function thisWeek(stats: DailyStats[]): { visits: number; unique: number } {
  const cut = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  let v = 0
  let u = 0
  for (const s of stats) {
    if (s.day >= cut) {
      v += s.visits
      u += s.uniqueIps
    }
  }
  return { visits: v, unique: u }
}

function divider(label: string, width: number): string {
  const inner = ` ${label} `
  const side = Math.max(0, Math.floor((width - inner.length) / 2))
  return "─".repeat(side) + inner + "─".repeat(width - side - inner.length)
}

function progressBar(ratio: number, len: number): string {
  const filled = Math.round(ratio * len)
  return "█".repeat(filled) + "░".repeat(len - filled)
}

// Expand the sparse daily rows (only days that had traffic) into a continuous
// last-N calendar-day series, zero-filling gaps. Charting off the sparse rows
// would collapse a week-long silence into a single step — this keeps the time
// axis honest so the line's slope reflects real dates. UTC throughout, to
// match date(created_at) and todayStr().
function fillDays(stats: DailyStats[], days: number): { day: string; visits: number }[] {
  const byDay = new Map(stats.map((s) => [s.day, s.visits]))
  const start = Date.now() - (days - 1) * 86400000
  const out: { day: string; visits: number }[] = []
  for (let i = 0; i < days; i++) {
    const day = new Date(start + i * 86400000).toISOString().slice(0, 10)
    out.push({ day, visits: byDay.get(day) ?? 0 })
  }
  return out
}

// ═══════════════════════════════════════════════════════════════════════
// graph view — Bloomberg-terminal-style line chart
// ═══════════════════════════════════════════════════════════════════════

type CellColor = "line" | "head" | "axis" | "label" | "blank"
type Cell = { ch: string; color: CellColor }
type Seg = { text: string; color: CellColor }

const LABEL_W = 4 // right-aligned y-axis number gutter
const GUTTER = LABEL_W + 1 // label columns + the ┤/└ axis column

// Merge a per-cell color array into runs so each row renders as a few spans
// instead of one span per character.
function coalesce(cells: Cell[]): Seg[] {
  const segs: Seg[] = []
  for (const c of cells) {
    const last = segs[segs.length - 1]
    if (last && last.color === c.color) last.text += c.ch
    else segs.push({ text: c.ch, color: c.color })
  }
  return segs
}

// Linearly resample `values` to exactly `cols` points so the polyline always
// spans the full plot width — the reference chart draws edge to edge even with
// only a handful of readings. Real day positions become the x-axis labels.
function resample(values: number[], cols: number): number[] {
  if (cols <= 0) return []
  if (values.length === 0) return Array(cols).fill(0)
  if (values.length === 1) return Array(cols).fill(values[0]!)
  const out: number[] = []
  for (let c = 0; c < cols; c++) {
    const pos = (c / (cols - 1)) * (values.length - 1)
    const i = Math.floor(pos)
    const frac = pos - i
    const a = values[i]!
    const b = values[Math.min(values.length - 1, i + 1)]!
    out.push(a + (b - a) * frac)
  }
  return out
}

type LineChart = { rows: Cell[][]; tick: Cell[]; labels: string; cols: number }

// asciichart-style polyline over a 0-based y-axis. Returns styled rows ready to
// render as spans: the line in accent, axis + labels dim. The y-axis is forced
// through 0 — visits are counts, so a zero baseline reads honestly.
function buildLineChart(
  days: { day: string; visits: number }[],
  width: number,
  plotH: number,
): LineChart {
  const cols = Math.max(1, width - LABEL_W - 1)
  const series = resample(
    days.map((d) => d.visits),
    cols,
  )
  const min = 0
  const max = Math.max(...series, 1)
  const ratio = (plotH - 1) / (max - min)
  const yOf = (v: number) => Math.round((v - min) * ratio) // 0..plotH-1 from bottom

  // grid[row][col], row 0 = top. Draw one box-drawing segment per column gap.
  const grid: string[][] = Array.from({ length: plotH }, () => Array(cols).fill(" "))
  for (let x = 0; x < cols - 1; x++) {
    const y0 = yOf(series[x]!)
    const y1 = yOf(series[x + 1]!)
    if (y0 === y1) {
      grid[plotH - 1 - y0]![x] = "─"
    } else {
      grid[plotH - 1 - y1]![x] = y0 > y1 ? "╰" : "╭"
      grid[plotH - 1 - y0]![x] = y0 > y1 ? "╮" : "╯"
      const from = Math.min(y0, y1)
      const to = Math.max(y0, y1)
      for (let y = from + 1; y < to; y++) grid[plotH - 1 - y]![x] = "│"
    }
  }
  grid[plotH - 1 - yOf(series[0]!)]![0] = "┼" // start marker

  // Label the top, middle and bottom rows of the y-axis.
  const tickRows = new Set([0, Math.floor((plotH - 1) / 2), plotH - 1])
  const rows: Cell[][] = grid.map((line, r) => {
    const yVal = max - (r / (plotH - 1)) * (max - min)
    const label = tickRows.has(r)
      ? String(Math.round(yVal)).padStart(LABEL_W)
      : " ".repeat(LABEL_W)
    const cells: Cell[] = []
    for (const ch of label) cells.push({ ch, color: "label" })
    cells.push({ ch: tickRows.has(r) ? "┤" : "│", color: "axis" })
    for (const ch of line) cells.push({ ch, color: ch === " " ? "blank" : "line" })
    return cells
  })

  // x-axis: └ origin, ─ baseline, ┬ under each dated tick.
  const nTicks = Math.min(6, Math.max(2, Math.floor(cols / 10)))
  const tickCols = Array.from({ length: nTicks }, (_, t) =>
    Math.round((t / (nTicks - 1)) * (cols - 1)),
  )
  const tickSet = new Set(tickCols)
  const tickCells: Cell[] = []
  for (let i = 0; i < LABEL_W; i++) tickCells.push({ ch: " ", color: "blank" })
  tickCells.push({ ch: "└", color: "axis" })
  for (let c = 0; c < cols; c++) tickCells.push({ ch: tickSet.has(c) ? "┬" : "─", color: "axis" })

  // x-axis labels: MM-DD centered under each tick, clamped to stay on-screen.
  const labelChars: string[] = Array(LABEL_W + 1 + cols).fill(" ")
  for (const c of tickCols) {
    const idx = Math.round((c / Math.max(1, cols - 1)) * (days.length - 1))
    const text = fmtDay(days[Math.max(0, Math.min(days.length - 1, idx))]!.day)
    let s = LABEL_W + 1 + c - Math.floor(text.length / 2)
    s = Math.max(0, Math.min(labelChars.length - text.length, s))
    for (let k = 0; k < text.length; k++) labelChars[s + k] = text[k]!
  }

  return { rows, tick: tickCells, labels: labelChars.join(""), cols }
}

// Mask a raw chart row to the trace frontier: the y-axis gutter is always
// visible, plot columns appear only once the left-to-right cursor reaches
// them, and the single cell at the frontier renders as a bright "pen tip".
function revealRow(cells: Cell[], drawn: number): Seg[] {
  return coalesce(
    cells.map((c, a): Cell => {
      const p = a - GUTTER
      if (p < 0) return c // y-axis gutter — always drawn
      if (p >= drawn) return { ch: " ", color: "blank" }
      if (p === drawn - 1 && c.color === "line") return { ch: c.ch, color: "head" }
      return c
    }),
  )
}

function ChartRow({ segs }: { segs: Seg[] }) {
  const theme = useTheme()
  const colorOf = (c: CellColor) =>
    c === "head"
      ? theme.fg
      : c === "line"
        ? theme.accent
        : c === "blank"
          ? undefined
          : theme.dim
  return (
    <text flexShrink={0}>
      {segs.map((s, i) => (
        <span key={i} fg={colorOf(s.color)}>
          {s.text}
        </span>
      ))}
    </text>
  )
}

function GraphView({
  width,
  height,
  stats,
  total,
  todayVisits,
  weekVisits,
  totalUnique,
}: {
  width: number
  height: number
  stats: DailyStats[]
  total: number
  todayVisits: number
  weekVisits: number
  totalUnique: number
}) {
  const theme = useTheme()
  const series = useMemo(() => fillDays(stats, DAYS), [stats])
  // Reserve header(2) + x-axis(2) + spacer+metrics(2) + rule+status(2) + slack.
  const plotH = Math.max(6, Math.min(12, height - 9))
  const chart = useMemo(() => buildLineChart(series, width, plotH), [series, width, plotH])
  // The line draws itself left-to-right on open; re-traces on theme switch.
  const drawn = useTraceReveal(chart.cols, theme.name)

  const metrics = `${todayVisits} today  ·  ${weekVisits} this week  ·  ${totalUnique} unique`

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* header — matches the guestbook/detail chrome */}
      <box flexDirection="row" width="100%" height={1} flexShrink={0}>
        <text flexShrink={1} fg={theme.fg} attributes={TextAttributes.BOLD}>
          STATS
        </text>
        <text flexShrink={0} fg={theme.accent}>
          {" "}
          ✱
        </text>
        <box flexGrow={1} minWidth={1} />
        <text flexShrink={0} fg={theme.dim}>
          N{String(total).padStart(4, "0")} VISITS
        </text>
      </box>

      <Rule heavy width={width} />

      <box flexGrow={1} />

      {/* ── the chart ────────────────────────────────────────────────── */}
      {total > 0 ? (
        <>
          <text flexShrink={0} fg={theme.dim}>
            {" ".repeat(LABEL_W + 1)}
            <span fg={theme.faint}>DAILY VISITS · LAST {DAYS}D</span>
          </text>
          {chart.rows.map((cells, i) => (
            <ChartRow key={i} segs={revealRow(cells, drawn)} />
          ))}
          <ChartRow segs={revealRow(chart.tick, drawn)} />
          <text flexShrink={0} fg={theme.dim}>
            {chart.labels.slice(0, GUTTER + drawn)}
          </text>
        </>
      ) : (
        <text flexShrink={0} fg={theme.dim}>
          {center("NO DATA YET", width)}
        </text>
      )}

      <text flexShrink={0}> </text>

      {/* key metrics */}
      <text flexShrink={0}>
        <span fg={theme.dim}>{center(metrics, width)}</span>
      </text>

      <box flexGrow={1} />

      <Rule width={width} />
      <StatusBar
        hints={[
          { key: "enter", label: "detail" },
          { key: "t", label: "theme" },
          { key: "q", label: "quit" },
        ]}
        right={`${identity.banner}.stats ✱`}
      />
    </box>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// detail view — sampler-style breakdown
// ═══════════════════════════════════════════════════════════════════════

function hourlyBlocks(
  buckets: HourlyBucket[],
  maxV: number,
): { label: string; bar: string; count: number }[] {
  const out: { label: string; bar: string; count: number }[] = []
  for (let start = 0; start < 24; start += 4) {
    let total = 0
    for (const b of buckets) {
      if (b.hour >= start && b.hour < start + 4) total += b.visits
    }
    const idx = maxV > 0 ? Math.round((total / maxV) * (SPARK.length - 1)) : 0
    out.push({
      label: `${String(start).padStart(2, "0")}-${String(start + 3).padStart(2, "0")}`,
      bar: SPARK[idx]!,
      count: total,
    })
  }
  return out
}

function DetailView({
  width,
  height,
  store,
  stats,
  total,
  totalUnique,
  peak,
  todayVisits,
  todayUnique,
  weekVisits,
  weekUnique,
}: {
  width: number
  height: number
  store: ReturnType<typeof getStore>
  stats: DailyStats[]
  total: number
  totalUnique: number
  peak: { day: string; visits: number } | null
  todayVisits: number
  todayUnique: number
  weekVisits: number
  weekUnique: number
}) {
  const theme = useTheme()
  const [selected, setSelected] = useState(0)

  // sparklines
  const vSpark = useMemo(() => {
    const max = Math.max(...stats.map((s) => s.visits), 1)
    return stats.map((s) => SPARK[Math.round((s.visits / max) * (SPARK.length - 1))]!).join("")
  }, [stats])
  const uSpark = useMemo(() => {
    const max = Math.max(...stats.map((s) => s.uniqueIps), 1)
    return stats.map((s) => SPARK[Math.round((s.uniqueIps / max) * (SPARK.length - 1))]!).join("")
  }, [stats])

  // progress bar
  const ratio = total > 0 ? totalUnique / total : 0
  const barLen = Math.max(4, Math.min(20, width - 30))
  const pbar = useMemo(() => progressBar(ratio, barLen), [ratio, barLen])

  // layout
  const count = stats.length
  const TOP = 13
  const BOT = 2
  const listMax = Math.min(count, Math.max(4, Math.min(9, Math.floor((height - TOP - BOT - 8) / 2))))
  const listOffset = useListWindow(selected, count, listMax)
  const detailRows = Math.max(3, height - TOP - BOT - listMax - (count > listMax ? 2 : 0) - 3)

  // ── selected day ──────────────────────────────────────────────────
  const selDay = stats[selected]
  const detailContent = useMemo(() => {
    if (!selDay) return null
    const hourly = store.dayHourly(selDay.day)
    const gb = store.dayGuestbookEntries(selDay.day)
    const maxH = Math.max(...hourly.map((h) => h.visits), 1)
    const blocks = hourlyBlocks(hourly, maxH)
    const msgs = gb.map((e) => `✱ ${e.ip}  ${e.name}: ${e.message}`)
    const avail = Math.max(1, detailRows - 4)
    const { lines: gbLines } = fitLines(msgs, width - 4, avail, false)
    return { blocks, gbLines, gbCount: gb.length, maxH }
  }, [selDay?.day, detailRows, width, store])

  // ── keyboard ──────────────────────────────────────────────────────
  useKeyboard((key) => {
    if (key.eventType === "release") return
    if (key.name === "j" || key.name === "down")
      setSelected((s) => Math.min(count - 1, s + 1))
    else if (key.name === "k" || key.name === "up")
      setSelected((s) => Math.max(0, s - 1))
    else if (key.name === "g" && key.shift) setSelected(count - 1)
    else if (key.name === "g") setSelected(0)
  })

  // x-axis for sparklines: pick labels at even spacings
  const xLabelsStr = useMemo(() => {
    let line = ""
    for (let i = 0; i < stats.length; i++) {
      if (i % 7 === 0) {
        const label = stats[i]!.day.slice(5)
        line += label
        i += label.length - 1
      } else {
        line += " "
      }
    }
    return line
  }, [stats])

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* ── VISIT OVERVIEW ─────────────────────────────────────────── */}
      <text flexShrink={0} fg={theme.dim}>
        {divider("VISIT OVERVIEW", width)}
      </text>

      {/* stat cards */}
      <text flexShrink={0}>
        <span fg={theme.accent}> TODAY</span>
        <span fg={theme.fg}>
          {" "}
          {todayVisits}v / {todayUnique}u
        </span>
        <span fg={theme.dim}>  │ </span>
        <span fg={theme.accent}>WEEK</span>
        <span fg={theme.fg}>
          {" "}
          {weekVisits}v / {weekUnique}u
        </span>
        <span fg={theme.dim}>  │ </span>
        <span fg={theme.accent}>UNIQUE</span>
        <span fg={theme.fg}> {totalUnique}</span>
        <span fg={theme.dim}>  │ </span>
        <span fg={theme.accent}>PEAK</span>
        {peak ? (
          <span fg={theme.fg}>
            {" "}
            {fmtDay(peak.day)} · {peak.visits}v
          </span>
        ) : (
          <span fg={theme.dim}> —</span>
        )}
      </text>

      {/* visits sparkline */}
      <text flexShrink={0}>
        <span fg={theme.dim}> visits  </span>
        <span fg={theme.accent}>{vSpark}</span>
        <span fg={theme.dim}>
          {"  today "}
          <span fg={theme.fg}>{todayVisits}</span>
          {"  week "}
          <span fg={theme.fg}>{weekVisits}</span>
        </span>
      </text>

      {/* unique sparkline */}
      <text flexShrink={0}>
        <span fg={theme.dim}> unique </span>
        <span fg={theme.accent}>{uSpark}</span>
        <span fg={theme.dim}>
          {"  today "}
          <span fg={theme.fg}>{todayUnique}</span>
          {"  week "}
          <span fg={theme.fg}>{weekUnique}</span>
        </span>
      </text>

      {/* x-axis */}
      <text flexShrink={0} fg={theme.dim}>
        <span>{" ".repeat(9)}</span>
        {xLabelsStr}
      </text>

      {/* progress bar */}
      <text flexShrink={0}>
        <span fg={theme.dim}> unique </span>
        <span fg={theme.accent}>{pbar}</span>
        <span fg={theme.dim}>
          {" "}
          <span fg={theme.fg}>{totalUnique}</span>
          {" / "}
          <span fg={theme.fg}>{total}</span>
          {"  "}
          <span fg={theme.accent}>{(ratio * 100).toFixed(1)}%</span>
        </span>
      </text>

      <text flexShrink={0}> </text>

      {/* ── DAILY BREAKDOWN ─────────────────────────────────────────── */}
      <text flexShrink={0} fg={theme.dim}>
        {divider("DAILY BREAKDOWN", width)}
      </text>

      <text flexShrink={0}> </text>

      {/* list */}
      {count === 0 ? (
        <text flexShrink={0} fg={theme.dim}>
          {"  NO DATA YET"}
        </text>
      ) : (
        <>
          <text flexShrink={0} fg={theme.dim}>
            {listOffset > 0 ? "↑ MORE" : " "}
          </text>
          {stats.slice(listOffset, listOffset + listMax).map((s) => {
            const i = stats.indexOf(s)
            const isSel = i === selected
            return (
              <box
                key={s.day}
                flexDirection="row"
                width="100%"
                height={1}
                overflow="hidden"
                flexShrink={0}
                backgroundColor={isSel ? theme.barBg : undefined}
              >
                <text flexShrink={0} fg={isSel ? theme.barFg : theme.accent}>
                  {isSel ? "  ▸ " : "    "}
                </text>
                <text flexShrink={0} fg={isSel ? theme.barFg : theme.fg}>
                  {fmtDay(s.day)}
                </text>
                <text flexShrink={0} fg={isSel ? theme.barFg : theme.dim}>
                  {"  "}
                </text>
                <text fg={isSel ? theme.barFg : theme.fg}>
                  {s.visits} visit{s.visits !== 1 ? "s" : ""}
                </text>
                <text flexShrink={0} fg={isSel ? theme.barFg : theme.dim}>
                  {" · "}
                </text>
                <text flexShrink={0} fg={isSel ? theme.barFg : theme.fg}>
                  {s.uniqueIps} unique
                </text>
                {s.guestbookEntries > 0 ? (
                  <>
                    <text flexShrink={0} fg={isSel ? theme.barFg : theme.dim}>
                      {" · "}
                    </text>
                    <text flexShrink={0} fg={isSel ? theme.barFg : theme.accent}>
                      {s.guestbookEntries} gb
                    </text>
                  </>
                ) : null}
              </box>
            )
          })}
          <text flexShrink={0} fg={theme.dim}>
            {listOffset + listMax < count ? "↓ MORE" : " "}
          </text>
        </>
      )}

      {/* ── day detail ──────────────────────────────────────────────── */}
      {selDay && (
        <box flexDirection="column" width="100%" flexShrink={0}>
          <text flexShrink={0}> </text>
          <text flexShrink={0} fg={theme.dim}>
            {divider(fmtDay(selDay.day), width)}
          </text>
          {detailContent ? (
            <>
              <text flexShrink={0}>
                <span fg={theme.dim}>  </span>
                {detailContent.blocks.slice(0, 3).map((b, i) => (
                  <span key={i}>
                    <span fg={theme.accent}>{b.bar}</span>
                    <span fg={theme.fg}> {b.label}</span>
                    <span fg={theme.dim}> {String(b.count).padStart(2)}</span>
                    {i < 2 ? <span fg={theme.dim}>   </span> : null}
                  </span>
                ))}
              </text>
              <text flexShrink={0}>
                <span fg={theme.dim}>  </span>
                {detailContent.blocks.slice(3, 6).map((b, i) => (
                  <span key={i}>
                    <span fg={theme.accent}>{b.bar}</span>
                    <span fg={theme.fg}> {b.label}</span>
                    <span fg={theme.dim}> {String(b.count).padStart(2)}</span>
                    {i < 2 ? <span fg={theme.dim}>   </span> : null}
                  </span>
                ))}
              </text>
              <text flexShrink={0} fg={theme.dim}>
                {"  peak: "}
                <span fg={theme.fg}>{detailContent.maxH}</span>
                {" visits in one 4h block"}
              </text>
              {detailContent.gbCount > 0 ? (
                <>
                  <text flexShrink={0}>
                    <span fg={theme.accent}>  ✱ </span>
                    <span fg={theme.dim}>guestbook ({detailContent.gbCount})</span>
                  </text>
                  {detailContent.gbLines.map((line, i) => (
                    <text key={i} flexShrink={0} fg={theme.fg}>
                      {"    "}
                      {line || " "}
                    </text>
                  ))}
                </>
              ) : (
                <text flexShrink={0} fg={theme.dim}>
                  {"  no guestbook entries this day"}
                </text>
              )}
            </>
          ) : null}
        </box>
      )}

      <box flexGrow={1} />
    </box>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// top-level page
// ═══════════════════════════════════════════════════════════════════════

const DAYS = 30

export function StatsPage({
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
  const store = getStore()
  const [detailOpen, setDetailOpen] = useState(false)

  // Data loaded once on mount (same for both views).
  const [total] = useState(() => store.totalVisits())
  const [stats] = useState<DailyStats[]>(() => store.dailyStats(DAYS))
  const [totalUnique] = useState(() => store.totalUniqueIps())
  const [peak] = useState(() => store.peakDay())

  const today = todayStr()
  const todayStats = stats.find((s) => s.day === today) ?? {
    day: today,
    visits: 0,
    uniqueIps: 0,
    guestbookEntries: 0,
  }
  const week = useMemo(() => thisWeek(stats), [stats])

  // ── keyboard ──────────────────────────────────────────────────────
  useKeyboard((key) => {
    if (key.eventType === "release") return
    if (key.name === "q" || (key.ctrl && key.name === "c")) return onExit()

    if (detailOpen) {
      // Parent handles escape/back/s/theme; j/k/g pass through to DetailView.
      if (key.name === "escape" || key.name === "backspace") {
        setDetailOpen(false)
        return
      }
      if (key.name === "s") return onClose()
      if (key.name === "t") return onToggleTheme()
      // all other keys fall through harmlessly — DetailView handles them
    } else {
      // Graph view: minimal keys
      if (key.name === "escape" || key.name === "backspace" || key.name === "s") return onClose()
      if (key.name === "t") return onToggleTheme()
      if (key.name === "return") {
        setDetailOpen(true)
        return
      }
    }
  })

  // ── render ────────────────────────────────────────────────────────

  const theme = useTheme()

  return (
    <box flexDirection="column" width="100%" height="100%">
      {detailOpen ? (
        <>
          {/* ═══ DETAIL HEADER ═══ */}
          <box flexDirection="row" width="100%" height={1} flexShrink={0}>
            <text flexShrink={1} fg={theme.fg} attributes={TextAttributes.BOLD}>
              STATS
            </text>
            <text flexShrink={0} fg={theme.accent}>
              {" "}
              ✱
            </text>
            <box flexGrow={1} minWidth={1} />
            <text flexShrink={0} fg={theme.dim}>
              N{String(total).padStart(4, "0")} VISITS
            </text>
          </box>
          <Rule heavy width={width} />
          <text flexShrink={0}> </text>

          <DetailView
            width={width}
            height={height}
            store={store}
            stats={stats}
            total={total}
            totalUnique={totalUnique}
            peak={peak}
            todayVisits={todayStats.visits}
            todayUnique={todayStats.uniqueIps}
            weekVisits={week.visits}
            weekUnique={week.unique}
          />

          <Rule width={width} />
          <StatusBar
            hints={[
              { key: "esc", label: "back" },
              { key: "j/k", label: "select" },
              { key: "t", label: "theme" },
              { key: "q", label: "quit" },
            ]}
            right={`${identity.banner}.stats ✱`}
          />
        </>
      ) : (
        <GraphView
          width={width}
          height={height}
          stats={stats}
          total={total}
          todayVisits={todayStats.visits}
          weekVisits={week.visits}
          totalUnique={totalUnique}
        />
      )}
    </box>
  )
}
