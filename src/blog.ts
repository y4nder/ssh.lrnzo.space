// The blog index and post bodies, read from api.lrnzo.space.
//
// STRICTLY READ-ONLY. Only GET /posts and GET /posts/:slug are ever touched;
// both are public and unguarded. The admin reads on that API sit behind a
// GitHub OAuth session cookie that cannot be minted server-side, and drafts are
// filtered out by the service itself — so there is nothing unpublished this
// module could reach even by accident.
//
// Shaped like nowplaying.ts (module singleton, one process serving every SSH
// session, hand-rolled total validation) with one deliberate divergence: this
// is DEMAND-DRIVEN, not polled. Now-playing changes every few minutes; posts
// change every few weeks. The API throttles at 100 req/min per IP and every
// visitor shares our single VPS egress IP, so a poll loop would spend that
// budget re-reading an article that has not moved since March.

import { subscribe as subscribePresence, getOnline } from "./presence"

// ---- TYPES -----------------------------------------------------------------

/** One row of GET /posts. Mirrors the API's PostSummaryDto. */
export type PostSummary = {
  slug: string
  /** Zero-padded entry number, e.g. "002". The API calls this `no`. */
  no: string
  title: string
  dek: string
  /** ISO 8601, or null if the API ever hands us a row without one. */
  publishedAt: string | null
  kind: string
  tags: string[]
  readingMinutes: number
  /** Only `alt` is used — no image is ever fetched. See ALT-ONLY below. */
  alt: string
}

/** GET /posts/:slug — a summary plus the raw GitHub-flavoured markdown. */
export type PostDetail = PostSummary & { body: string }

export type IndexState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; posts: PostSummary[] }
  | { status: "error" }

export type BodyState =
  | { status: "loading" }
  | { status: "ready"; post: PostDetail }
  | { status: "error"; notFound: boolean }

// ALT-ONLY. Post covers are full-resolution PNGs (the current one is 2880x1620,
// 511KB) and the API offers no thumbnail or format negotiation. albumArt.ts
// decodes synchronously on the shared event loop and is capped at 1MP for
// exactly that reason — a 4.7MP inflate there would stall every connected
// session at once. So the blog takes `media.alt` and never touches media.src.

export const DEFAULT_URL = "https://api.lrnzo.space/posts"
/** One page covers the corpus by orders of magnitude; the API clamps to 100. */
export const PAGE_LIMIT = 100
/** How long an index stays fresh before the next open revalidates it. */
export const INDEX_TTL_MS = 5 * 60_000
export const REQUEST_TIMEOUT_MS = 6_000
/** Floor between failed index attempts, doubling to the ceiling. */
export const RETRY_MS = 5_000
export const MAX_RETRY_MS = 120_000
/** Post bodies are capped at 100kb server-side; this is pure abuse protection. */
export const MAX_BYTES = 512 * 1024
const BODY_CACHE_MAX = 8

export function clock(): number {
  return performance.now()
}

// ---- CONFIG ----------------------------------------------------------------

// A fixture short-circuits the network entirely: seed the store at load, never
// fetch. This is how tests and scripts/frame-dump.ts get a deterministic frame
// with the feature switched on.
const rawFixture = process.env.BLOG_FIXTURE
// Trailing slash stripped so `${base}/${slug}` can't produce a double slash.
const endpoint = (process.env.BLOG_URL ?? DEFAULT_URL).replace(/\/+$/, "")

// bun test sets NODE_ENV=test, and smoke.test.ts spreads process.env into the
// server it spawns — so this one check keeps the whole suite off the network,
// integration tests included.
const enabled = endpoint !== "" && process.env.NODE_ENV !== "test"

export function isEnabled(): boolean {
  return enabled
}

// ---- STORE -----------------------------------------------------------------

type Listener = () => void

let index: IndexState = { status: "idle" }
let indexFetchedAt = 0
const bodies = new Map<string, BodyState>()
const listeners = new Set<Listener>()

// The snapshot is a NUMBER, on the presence.ts pattern. useSyncExternalStore
// requires getSnapshot to return a cached value — it throws "The result of
// getSnapshot should be cached" and can spin forever otherwise — and a version
// counter sidesteps the whole identity problem that nowplaying.ts has to
// document its way around. Hooks bump on this, then read the real state.
let version = 0

export function getVersion(): number {
  return version
}

export function getIndex(): IndexState {
  return index
}

export function getBody(slug: string): BodyState | undefined {
  return bodies.get(slug)
}

export function subscribe(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The sole writer. Everything that mutates store state goes through here. */
function publish(mutate: () => void): void {
  mutate()
  version++
  for (const l of listeners) l()
}

/** Fixtures and tests only. */
export function __reset(): void {
  publish(() => {
    index = { status: "idle" }
    indexFetchedAt = 0
    bodies.clear()
    inFlight.clear()
    failures = 0
    retryAfter = 0
    reportedDown = false
  })
}

// ---- VALIDATION ------------------------------------------------------------

// Hand-rolled and total, as in nowplaying.ts: there is no zod in the dep tree,
// and nothing here may throw. A post body is remote input rendered into a live
// terminal — a malformed field must degrade to a blank line, never to a stack
// trace that takes the session with it.

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback
}

function finite(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
}

/**
 * One row -> PostSummary, or null if it is unusable.
 *
 * `slug` and `title` are the only hard requirements: the slug is the key the
 * body is fetched by, and a row with no title has nothing to draw. Everything
 * else defaults, because dropping an entire post over a missing `readingMinutes`
 * would be a worse failure than showing it without one.
 */
export function parseSummary(raw: unknown): PostSummary | null {
  if (typeof raw !== "object" || raw === null) return null
  const r = raw as Record<string, unknown>

  const slug = str(r.slug)
  const title = str(r.title)
  if (slug === "" || title === "") return null

  // `media` is documented non-null on the public routes, but it is a jsonb
  // column with no key-order guarantee and it is null on admin drafts, so this
  // must not assume the shape. An empty alt marks the image decorative.
  const media = typeof r.media === "object" && r.media !== null ? (r.media as Record<string, unknown>) : null

  return {
    slug,
    title,
    no: str(r.no),
    dek: str(r.dek),
    publishedAt: typeof r.publishedAt === "string" ? r.publishedAt : null,
    kind: str(r.kind),
    tags: strings(r.tags),
    readingMinutes: Math.max(0, Math.round(finite(r.readingMinutes))),
    alt: media ? str(media.alt) : "",
  }
}

/** GET /posts is WRAPPED in {data,total,page,limit}; the detail route is not. */
export function parseIndex(raw: unknown): PostSummary[] | null {
  if (typeof raw !== "object" || raw === null) return null
  const data = (raw as Record<string, unknown>).data
  if (!Array.isArray(data)) return null
  // A bad row is dropped, not fatal: one malformed post must not blank the log.
  return data.map(parseSummary).filter((p): p is PostSummary => p !== null)
}

export function parseDetail(raw: unknown): PostDetail | null {
  const summary = parseSummary(raw)
  if (!summary) return null
  const body = str((raw as Record<string, unknown>).body)
  return { ...summary, body }
}

// ---- FETCHING --------------------------------------------------------------

// The index shares the in-flight set with post slugs. A leading space keeps it
// out of the slug namespace — the API slugifies to [a-z0-9-].
const INDEX_KEY = " index"

const inFlight = new Set<string>()
let failures = 0
let retryAfter = 0
// Latched so an API outage logs once per outage rather than once per keypress.
let reportedDown = false

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { accept: "application/json", "user-agent": "lrnzo-ssh-portfolio" },
  })
  if (!response.ok) throw new HttpError(response.status)

  // Cheapest rejection first, before a byte of body is read.
  const declared = Number(response.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > MAX_BYTES) throw new HttpError(0)
  const text = await response.text()
  // A chunked response carries no length header, so the real size is only
  // knowable here.
  if (text.length > MAX_BYTES) throw new HttpError(0)
  return JSON.parse(text) as unknown
}

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`http ${status}`)
  }
}

function noteFailure(): void {
  failures++
  // Doubling backoff. Without a floor, a visitor leaning on `l` against a dead
  // API would fire one request per keypress and burn the shared rate limit.
  retryAfter = clock() + Math.min(RETRY_MS * 2 ** (failures - 1), MAX_RETRY_MS)
  if (!reportedDown) {
    reportedDown = true
    console.error("[blog] unreachable, backing off")
  }
}

function noteSuccess(): void {
  failures = 0
  retryAfter = 0
  reportedDown = false
}

/**
 * Fetch the index if it is missing or stale. Safe to call on every keypress.
 *
 * Stale-while-revalidate: a refresh over an existing list leaves the old posts
 * on screen and swaps them only on success, so reopening the log during a blip
 * never replaces readable content with an error.
 */
export function ensureIndex(): void {
  if (!enabled) return
  if (inFlight.has(INDEX_KEY)) return

  const fresh = index.status === "ready" && clock() - indexFetchedAt < INDEX_TTL_MS
  if (fresh) return
  if (retryAfter > 0 && clock() < retryAfter) return

  const hadPosts = index.status === "ready"
  inFlight.add(INDEX_KEY)
  if (!hadPosts) publish(() => void (index = { status: "loading" }))

  void getJson(`${endpoint}?limit=${PAGE_LIMIT}`)
    .then((raw) => {
      const posts = parseIndex(raw)
      if (!posts) throw new Error("malformed index")
      noteSuccess()
      publish(() => {
        index = { status: "ready", posts }
        indexFetchedAt = clock()
      })
    })
    .catch(() => {
      noteFailure()
      // Keep a previously good list rather than replacing it with an error.
      if (!hadPosts) publish(() => void (index = { status: "error" }))
    })
    .finally(() => inFlight.delete(INDEX_KEY))
}

/**
 * Fetch one post body if it isn't already cached or in flight.
 *
 * No promise is returned, on the ensureArt precedent: an await here would put
 * an unhandled-rejection risk into the one process serving every session.
 * Callers subscribe to the store and read getBody(slug) instead.
 */
export function ensureBody(slug: string): void {
  if (!enabled || slug === "") return
  const cached = bodies.get(slug)
  // A 404 is a fact about the post, not a transient failure — don't re-ask.
  if (cached && (cached.status === "ready" || (cached.status === "error" && cached.notFound))) {
    if (cached.status === "ready") touch(slug)
    return
  }
  if (inFlight.has(slug)) return

  inFlight.add(slug)
  publish(() => void bodies.set(slug, { status: "loading" }))

  void getJson(`${endpoint}/${encodeURIComponent(slug)}`)
    .then((raw) => {
      const post = parseDetail(raw)
      if (!post) throw new Error("malformed post")
      noteSuccess()
      publish(() => {
        bodies.set(slug, { status: "ready", post })
        evict()
      })
    })
    .catch((err: unknown) => {
      const notFound = err instanceof HttpError && err.status === 404
      if (!notFound) noteFailure()
      publish(() => void bodies.set(slug, { status: "error", notFound }))
    })
    .finally(() => inFlight.delete(slug))
}

/** Re-insert so the Map's insertion order stays LRU. */
function touch(slug: string): void {
  const hit = bodies.get(slug)
  if (!hit) return
  bodies.delete(slug)
  bodies.set(slug, hit)
}

function evict(): void {
  while (bodies.size > BODY_CACHE_MAX) {
    const oldest = bodies.keys().next().value
    if (oldest === undefined) break
    bodies.delete(oldest)
  }
}

// ---- STARTUP ---------------------------------------------------------------

if (rawFixture) {
  // The fixture is the detail shape (posts WITH bodies), so one blob seeds both
  // the index and the reader and no code path can reach the network.
  try {
    const raw: unknown = JSON.parse(rawFixture)
    const rows = Array.isArray(raw) ? raw : []
    const posts: PostSummary[] = []
    for (const row of rows) {
      const detail = parseDetail(row)
      if (!detail) continue
      posts.push(detail)
      bodies.set(detail.slug, { status: "ready", post: detail })
    }
    index = { status: "ready", posts }
    indexFetchedAt = clock()
  } catch {
    index = { status: "error" }
  }
} else if (enabled) {
  // Warm the index when the first visitor arrives so `l` opens instantly. One
  // shot on the presence edge, not a loop — there is no timer in this module at
  // all, and so nothing that could keep the process alive past SIGTERM.
  subscribePresence(() => {
    if (getOnline() > 0) ensureIndex()
  })
  if (getOnline() > 0) ensureIndex()
}
