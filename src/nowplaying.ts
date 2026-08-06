// Live Spotify readout, fed by GET /now-playing on api.lrnzo.space.
//
// THE FIRST OUTBOUND HTTP CALL IN THIS CODEBASE, and the shape is dictated by
// the deployment: one Bun process serves every SSH session from ONE VPS IP, and
// the endpoint rate-limits at 30 req/min per IP. The website polls per visitor
// (see lrnzo.space/src/components/NowPlaying.tsx) — doing that here would trip
// the limit at ~10 concurrent visitors. So this is a module singleton on the
// presence.ts pattern: one poll loop for the whole process at 3 req/min, no
// matter how many people are connected, and NOTHING at all while nobody is.
//
// Every failure resolves to "render nothing" — same contract the web island
// states. A dead API must never produce a broken frame, and an unhandled
// rejection in here would take down the process serving all 30 sessions.

import { getArt, ensureArt, type Art } from "./albumArt"
import { getOnline, subscribe as subscribePresence } from "./presence"

export type Track = {
  title: string
  artist: string
  album: string
  // OPTIONAL and it stays that way: the API and this app deploy independently,
  // and a release with no cover art is a real steady state, not an error.
  albumArt?: string | null
  url: string
  durationMs: number
}

export type NowPlayingData = {
  isPlaying: boolean
  track: Track | null
  progressMs: number | null
  playedAt: string | null
  ageMs: number
}

export type Snapshot = {
  data: NowPlayingData
  /** Monotonic reading of when this arrived. See positionMs. */
  receivedAt: number
  /** Cover glyphs and inks, filled by a LATER publish once the jpeg lands. */
  art: Art | null
}

/** Matches the API's 15s playing window closely enough to stay current. */
export const POLL_MS = 20_000
/** Ceiling for the failure backoff. */
export const MAX_POLL_MS = 120_000
export const REQUEST_TIMEOUT_MS = 5_000
/**
 * Consecutive failures tolerated before the ticker hides. One dropped request
 * should not collapse the row — the API serves a stale snapshot for five
 * minutes, so reaching this count means it is genuinely unreachable.
 */
export const HIDE_AFTER_FAILURES = 2
export const DEFAULT_URL = "https://api.lrnzo.space/now-playing"

export function clock(): number {
  return performance.now()
}

// ---- CONFIG ----------------------------------------------------------------

// A fixture short-circuits the network entirely: publish once at load, never
// poll, never fetch art. This is how tests and scripts/frame-dump.ts get a
// deterministic frame with the feature switched on.
const rawFixture = process.env.NOWPLAYING_FIXTURE
const endpoint = process.env.NOWPLAYING_URL ?? DEFAULT_URL

// bun test sets NODE_ENV=test, and smoke.test.ts spreads process.env into the
// server it spawns — so this one check keeps the whole suite off the network,
// integration tests included.
const enabled = endpoint !== "" && process.env.NODE_ENV !== "test"

export function isEnabled(): boolean {
  return enabled
}

// ---- STORE -----------------------------------------------------------------

type Listener = () => void

let snapshot: Snapshot | null = null
let trackSeq = 0
let lastUrl: string | null = null
const listeners = new Set<Listener>()

/**
 * MUST return the same object between publishes. useSyncExternalStore throws
 * "The result of getSnapshot should be cached" and can spin forever if this
 * hands back a fresh object per call — presence.ts returns a number and
 * sidesteps the whole problem, we can't. publish() is the only writer.
 */
export function getSnapshot(): Snapshot | null {
  return snapshot
}

/** Bumps ONLY on a genuine track change, so it can drive the glitch burst. */
export function getTrackSeq(): number {
  return trackSeq
}

/** Primitive selector for App, which must not re-render on every poll. */
export function getHasTrack(): boolean {
  return snapshot?.data.track != null
}

export function subscribe(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

function notify(): void {
  for (const l of listeners) l()
}

function publish(next: Snapshot | null): void {
  const url = next?.data.track?.url ?? null
  if (url !== lastUrl) {
    lastUrl = url
    if (url !== null) trackSeq++
  }
  snapshot = next
  notify()
}

/** Fixtures and tests only. */
export function __publish(next: Snapshot | null): void {
  publish(next)
}

// ---- VALIDATION ------------------------------------------------------------

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}

function finite(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

function parseTrack(raw: unknown): Track | null {
  if (typeof raw !== "object" || raw === null) return null
  const t = raw as Record<string, unknown>

  const title = str(t.title)
  const artist = str(t.artist)
  const url = str(t.url)
  const durationMs = finite(t.durationMs)
  // A zero or negative duration would divide straight into a NaN meter width,
  // so it is rejected here rather than guarded at every render site.
  if (!title || !artist || !url || durationMs === null || durationMs <= 0) return null

  const albumArt = str(t.albumArt)
  return {
    title,
    artist,
    album: str(t.album) ?? "",
    albumArt,
    url,
    durationMs,
  }
}

/**
 * Total: returns null for anything it cannot vouch for, and never throws.
 * `track: null` is a VALID payload (nothing to show) and parses successfully —
 * only a malformed response returns null from here.
 */
export function parsePayload(raw: unknown): NowPlayingData | null {
  if (typeof raw !== "object" || raw === null) return null
  const d = raw as Record<string, unknown>
  if (typeof d.isPlaying !== "boolean") return null

  const ageMs = finite(d.ageMs)
  if (ageMs === null || ageMs < 0) return null

  // Present-but-null is the documented idle shape; absent is malformed.
  const track = d.track == null ? null : parseTrack(d.track)
  if (d.track != null && track === null) return null

  const progress = finite(d.progressMs)
  return {
    isPlaying: d.isPlaying && track !== null,
    track,
    progressMs: progress !== null && progress >= 0 ? progress : null,
    playedAt: str(d.playedAt),
    ageMs,
  }
}

// ---- POSITION --------------------------------------------------------------

/**
 * Elapsed position, derived from DURATIONS ONLY.
 *
 * `ageMs` is how stale the API said the snapshot was when it answered; the rest
 * is measured locally from when it arrived. Neither clock is compared against
 * the other, which is exactly why the API sends an age instead of a timestamp.
 * `playedAt` is display copy and never arithmetic.
 */
export function positionMs(snap: Snapshot, now: number): number | null {
  const track = snap.data.track
  if (!track || !snap.data.isPlaying) return null
  // A backwards jump would otherwise rewind the meter below progressMs.
  const elapsed = snap.data.ageMs + Math.max(0, now - snap.receivedAt)
  return Math.min((snap.data.progressMs ?? 0) + elapsed, track.durationMs)
}

// ---- POLLER ----------------------------------------------------------------

let timer: ReturnType<typeof setTimeout> | undefined
let controller: AbortController | null = null
let polling = false
let failures = 0
let delay = POLL_MS
/** Logged state, so a dead API doesn't flood deploy logs at 3/min. */
let reportedDown = false

export function __isPolling(): boolean {
  return polling
}

function schedule(ms: number): void {
  clearTimeout(timer)
  // unref matters: a live timer keeps the process alive past SIGTERM's grace
  // window and would hang `bun test` on a suite that imported this module.
  timer = setTimeout(() => void poll(), ms)
  timer.unref?.()
}

function onArt(url: string, art: Art | null): void {
  const current = snapshot
  // The track may well have moved on while the jpeg was in flight.
  if (art === null || current === null || current.data.track?.albumArt !== url) return
  publish({ ...current, art })
}

function fail(): void {
  failures++
  delay = Math.min(delay * 2, MAX_POLL_MS)
  if (failures < HIDE_AFTER_FAILURES) return

  // Only once we have actually given up: a single dropped request is normal
  // and says nothing worth a line in the deploy log.
  if (snapshot !== null) publish(null)
  if (!reportedDown) {
    reportedDown = true
    console.error("[nowplaying] endpoint unreachable; readout hidden")
  }
}

async function poll(): Promise<void> {
  if (!polling) return

  controller?.abort()
  const ac = new AbortController()
  controller = ac
  const timeout = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(endpoint, { signal: ac.signal })

    if (response.status === 429) {
      // Backing off slowly here is the whole point — a 429 answered with more
      // requests keeps renewing itself.
      const retry = Number(response.headers.get("retry-after"))
      const wait = Number.isFinite(retry) && retry > 0 ? retry * 1000 : 60_000
      delay = Math.min(Math.max(delay, wait), MAX_POLL_MS)
    } else if (!response.ok) {
      fail()
    } else {
      const data = parsePayload(await response.json())
      if (data === null) {
        fail()
      } else {
        if (reportedDown) {
          reportedDown = false
          console.log("[nowplaying] endpoint recovered")
        }
        failures = 0
        delay = POLL_MS
        const art = data.track?.albumArt ?? null
        publish({ data, receivedAt: clock(), art: art ? getArt(art) : null })
        // Cheap and idempotent once cached; the callback re-publishes if the
        // cover was not already in hand.
        if (art) ensureArt(art, onArt)
      }
    }
  } catch {
    // An abort is us tearing down or superseding, not a fault — but telling
    // them apart costs more than an extra backoff step on a shutdown path
    // nobody observes, so both land here.
    if (polling) fail()
  } finally {
    clearTimeout(timeout)
    if (controller === ac) controller = null
  }

  if (polling) schedule(delay)
}

export function start(): void {
  if (polling || !enabled) return
  polling = true
  failures = 0
  delay = POLL_MS
  void poll().catch(() => {})
}

export function stop(): void {
  if (!polling) return
  polling = false
  clearTimeout(timer)
  timer = undefined
  controller?.abort()
  controller = null
  // Nobody is watching, and this guarantees the next visitor is never shown an
  // hours-old snapshot from before the lull.
  publish(null)
}

// ---- WIRING ----------------------------------------------------------------

if (rawFixture) {
  try {
    const data = parsePayload(JSON.parse(rawFixture))
    if (data === null) throw new Error("shape")
    publish({ data, receivedAt: clock(), art: null })
  } catch {
    console.error("[nowplaying] NOWPLAYING_FIXTURE is not a valid payload; ignoring")
  }
} else if (enabled) {
  // Poll only while somebody is actually connected. presence.subscribe fires on
  // every join and leave; the immediate check covers a join that beat this
  // module's first import.
  subscribePresence(() => {
    if (getOnline() > 0) start()
    else stop()
  })
  if (getOnline() > 0) start()
}
