import { expect, test } from "bun:test"
import { createStore, openDb, sanitize, MAX_ENTRIES, MSG_MAX, NAME_MAX } from "../src/db"

const fresh = () => createStore(openDb(":memory:"))

test("visitor numbers increment per session and survive as MAX(id)", () => {
  const store = fresh()
  expect(store.recordVisit("1.1.1.1")).toBe(1)
  expect(store.recordVisit("1.1.1.1")).toBe(2)
  expect(store.recordVisit("2.2.2.2")).toBe(3)
  expect(store.totalVisits()).toBe(3)
})

test("sanitize strips escape sequences, control chars, and non-ASCII", () => {
  expect(sanitize("\x1b[31mred\x1b[0m", MSG_MAX)).toBe("red")
  expect(sanitize("hi\x07\x00thereé", MSG_MAX)).toBe("hithere")
  expect(sanitize("  spaced   out  ", MSG_MAX)).toBe("spaced out")
  expect(sanitize("x".repeat(500), MSG_MAX)).toHaveLength(MSG_MAX)
  expect(sanitize("x".repeat(500), NAME_MAX)).toHaveLength(NAME_MAX)
})

test("empty or whitespace-only messages are rejected", () => {
  const store = fresh()
  expect(store.addEntry("1.1.1.1", "someone", "")).toEqual({ ok: false, reason: "empty" })
  expect(store.addEntry("1.1.1.1", "someone", "   \x1b[2J  ")).toEqual({
    ok: false,
    reason: "empty",
  })
  expect(store.listGuestbook()).toHaveLength(0)
})

test("empty name becomes ANONYMOUS", () => {
  const store = fresh()
  const result = store.addEntry("1.1.1.1", "  ", "hello")
  expect(result.ok).toBe(true)
  if (result.ok) expect(result.entry.name).toBe("ANONYMOUS")
})

test("same ip is rate limited inside the window, other ips pass", () => {
  const store = fresh()
  expect(store.addEntry("1.1.1.1", "a", "first").ok).toBe(true)
  const second = store.addEntry("1.1.1.1", "a", "second")
  expect(second.ok).toBe(false)
  if (!second.ok && second.reason === "rate_limited") expect(second.retryAfterSec).toBeGreaterThan(0)
  expect(second).toMatchObject({ reason: "rate_limited" })
  expect(store.addEntry("2.2.2.2", "b", "other ip").ok).toBe(true)
})

test("a zero-minute window disables rate limiting", () => {
  const store = createStore(openDb(":memory:"), 0)
  expect(store.addEntry("1.1.1.1", "a", "first").ok).toBe(true)
  expect(store.addEntry("1.1.1.1", "a", "second").ok).toBe(true)
})

test("analytics: unique ips, peak day, and daily rollup", () => {
  const store = createStore(openDb(":memory:"), 0)
  store.recordVisit("1.1.1.1")
  store.recordVisit("1.1.1.1") // same ip, second visit
  store.recordVisit("2.2.2.2")
  store.addEntry("3.3.3.3", "sig", "hi")

  expect(store.totalVisits()).toBe(3)
  expect(store.totalUniqueIps()).toBe(2)

  const today = new Date().toISOString().slice(0, 10)
  const peak = store.peakDay()
  expect(peak).toEqual({ day: today, visits: 3 })

  const daily = store.dailyStats(30)
  const row = daily.find((d) => d.day === today)
  expect(row).toEqual({ day: today, visits: 3, uniqueIps: 2, guestbookEntries: 1 })

  // hourly buckets sum back to the day's visit total
  const hourly = store.dayHourly(today)
  expect(hourly.reduce((a, h) => a + h.visits, 0)).toBe(3)

  const gb = store.dayGuestbookEntries(today)
  expect(gb).toEqual([{ ip: "3.3.3.3", name: "sig", message: "hi" }])
})

test("analytics: empty store reports zeroes and no peak", () => {
  const store = fresh()
  expect(store.totalUniqueIps()).toBe(0)
  expect(store.peakDay()).toBeNull()
  expect(store.dailyStats(30)).toEqual([])
})

test("guestbook prunes to the newest entries, newest first", () => {
  const store = createStore(openDb(":memory:"), 0)
  for (let i = 1; i <= MAX_ENTRIES + 5; i++) store.addEntry("1.1.1.1", "n", `msg ${i}`)
  const entries = store.listGuestbook(MAX_ENTRIES + 100)
  expect(entries).toHaveLength(MAX_ENTRIES)
  expect(entries[0]!.message).toBe(`msg ${MAX_ENTRIES + 5}`)
  expect(entries[entries.length - 1]!.message).toBe("msg 6")
})
