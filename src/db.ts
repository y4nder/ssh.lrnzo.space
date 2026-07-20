// Persistence for the visitor counter and guestbook, on bun:sqlite. One Bun
// process serves every SSH session, so a module-level store is the correct
// scope here (unlike theme, which must stay per-session React state). All
// queries are synchronous — components read on mount/after-submit.
import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

export const MSG_MAX = 120
export const NAME_MAX = 24
export const MAX_ENTRIES = 500
const RATE_LIMIT_MIN = Number(process.env.GUESTBOOK_RATE_MIN ?? 10)

export type GuestbookEntry = {
  id: number
  name: string
  message: string
  created_at: string
}

export type AddResult =
  | { ok: true; entry: GuestbookEntry }
  | { ok: false; reason: "empty" }
  | { ok: false; reason: "rate_limited"; retryAfterSec: number }

export type DailyStats = {
  day: string      // "YYYY-MM-DD"
  visits: number
  uniqueIps: number
  guestbookEntries: number
}

export type HourlyBucket = {
  hour: number     // 0-23
  visits: number
}

export type DayGuestbookEntry = {
  name: string
  message: string
}

// SSH input is untrusted: keep printable ASCII only. The compose UI filters
// per keystroke too; this is the last line of defense before the row lands.
export function sanitize(input: string, max: number): string {
  return input
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "") // CSI escape sequences
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/ +/g, " ")
    .trim()
    .slice(0, max)
}

const isoNow = () => new Date().toISOString().replace(/\.\d+Z$/, "Z")

// AUTOINCREMENT (not plain rowid) is deliberate: ids are never reused after
// pruning/moderation deletes, so visitor numbers stay monotonic and stable.
export function openDb(path: string): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path, { create: true })
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS visits (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      ip         TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE TABLE IF NOT EXISTS guestbook (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      ip         TEXT NOT NULL,
      name       TEXT NOT NULL DEFAULT 'ANONYMOUS',
      message    TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_guestbook_ip_created ON guestbook(ip, created_at);
  `)
  return db
}

export function createStore(db: Database, rateLimitMin = RATE_LIMIT_MIN) {
  const rateLimitMs = rateLimitMin * 60_000

  const recordVisit = (ip: string): number => {
    const row = db
      .query<{ id: number }, [string, string]>(
        "INSERT INTO visits (ip, created_at) VALUES (?, ?) RETURNING id",
      )
      .get(ip, isoNow())
    return row!.id
  }

  // MAX(id), not COUNT: robust if old visit rows are ever pruned.
  const totalVisits = (): number => {
    const row = db
      .query<{ n: number }, []>("SELECT COALESCE(MAX(id), 0) AS n FROM visits")
      .get()
    return row!.n
  }

  const listGuestbook = (limit = 200): GuestbookEntry[] =>
    db
      .query<GuestbookEntry, [number]>(
        "SELECT id, name, message, created_at FROM guestbook ORDER BY id DESC LIMIT ?",
      )
      .all(limit)

  const addEntry = (ip: string, name: string, message: string): AddResult => {
    const cleanMessage = sanitize(message, MSG_MAX)
    if (!cleanMessage) return { ok: false, reason: "empty" }
    const cleanName = sanitize(name, NAME_MAX) || "ANONYMOUS"

    const insert = db.transaction((): AddResult => {
      const last = db
        .query<{ created_at: string }, [string]>(
          "SELECT created_at FROM guestbook WHERE ip = ? ORDER BY id DESC LIMIT 1",
        )
        .get(ip)
      if (last) {
        const elapsed = Date.now() - Date.parse(last.created_at)
        if (elapsed < rateLimitMs) {
          return {
            ok: false,
            reason: "rate_limited",
            retryAfterSec: Math.ceil((rateLimitMs - elapsed) / 1000),
          }
        }
      }
      const entry = db
        .query<GuestbookEntry, [string, string, string, string]>(
          `INSERT INTO guestbook (ip, name, message, created_at) VALUES (?, ?, ?, ?)
           RETURNING id, name, message, created_at`,
        )
        .get(ip, cleanName, cleanMessage, isoNow())!
      db.run(
        `DELETE FROM guestbook WHERE id NOT IN
           (SELECT id FROM guestbook ORDER BY id DESC LIMIT ?)`,
        [MAX_ENTRIES],
      )
      return { ok: true, entry }
    })
    return insert()
  }

  // ── analytics ──────────────────────────────────────────────────────

  const totalUniqueIps = (): number => {
    const row = db
      .query<{ n: number }, []>("SELECT COUNT(DISTINCT ip) AS n FROM visits")
      .get()
    return row!.n
  }

  const peakDay = (): { day: string; visits: number } | null => {
    const row = db
      .query<{ day: string; visits: number }, []>(
        "SELECT date(created_at) AS day, COUNT(*) AS visits FROM visits GROUP BY day ORDER BY visits DESC LIMIT 1",
      )
      .get()
    return row ?? null
  }

  const dailyStats = (days: number): DailyStats[] => {
    const visitRows = db
      .query<{ day: string; visits: number; unique_ips: number }, [number]>(
        `SELECT date(created_at) AS day, COUNT(*) AS visits, COUNT(DISTINCT ip) AS unique_ips
         FROM visits
         WHERE created_at >= datetime('now', '-' || ? || ' days')
         GROUP BY day
         ORDER BY day`,
      )
      .all(days)

    const gbRows = db
      .query<{ day: string; entries: number }, [number]>(
        `SELECT date(created_at) AS day, COUNT(*) AS entries
         FROM guestbook
         WHERE created_at >= datetime('now', '-' || ? || ' days')
         GROUP BY day
         ORDER BY day`,
      )
      .all(days)

    const gbMap = new Map(gbRows.map((r) => [r.day, r.entries]))
    return visitRows.map((r) => ({
      day: r.day,
      visits: r.visits,
      uniqueIps: r.unique_ips,
      guestbookEntries: gbMap.get(r.day) ?? 0,
    }))
  }

  const dayHourly = (day: string): HourlyBucket[] =>
    db
      .query<HourlyBucket, [string]>(
        `SELECT CAST(strftime('%H', created_at) AS INTEGER) AS hour, COUNT(*) AS visits
         FROM visits WHERE date(created_at) = ? GROUP BY hour ORDER BY hour`,
      )
      .all(day)

  const dayGuestbookEntries = (day: string): DayGuestbookEntry[] =>
    db
      .query<DayGuestbookEntry, [string]>(
        "SELECT name, message FROM guestbook WHERE date(created_at) = ? ORDER BY id",
      )
      .all(day)

  return { recordVisit, totalVisits, listGuestbook, addEntry, totalUniqueIps, peakDay, dailyStats, dayHourly, dayGuestbookEntries }
}

export type Store = ReturnType<typeof createStore>

let defaultStore: Store | null = null

export function getStore(): Store {
  if (!defaultStore) {
    const path = process.env.DB_PATH ?? "data/portfolio.db"
    try {
      defaultStore = createStore(openDb(path))
    } catch (err) {
      // fail loud: a root-owned data dir gives EACCES here (same trap as the
      // volume-mounted host key — the dir must belong to uid 1000)
      throw new Error(`cannot open database at ${path}: ${err}`)
    }
  }
  return defaultStore
}
