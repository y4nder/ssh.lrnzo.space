import { describe, expect, test } from "bun:test"
import {
  __isPolling,
  __publish,
  clock,
  getHasTrack,
  getSnapshot,
  getTrackSeq,
  isEnabled,
  parsePayload,
  positionMs,
  subscribe,
  type NowPlayingData,
  type Snapshot,
} from "../src/nowplaying"

// The exact body api.lrnzo.space returned during development, verbatim.
const LIVE_BODY = {
  isPlaying: true,
  track: {
    title: "Dear Child (I've Been Dying to Reach You)",
    artist: "Anthony Green",
    album: "Avalon",
    albumArt: "https://i.scdn.co/image/ab67616d00001e0554ac46aa0c503e4df29a2f9d",
    url: "https://open.spotify.com/track/2VFxYVlUzDQQrf9ZLDXUIn",
    durationMs: 203200,
  },
  progressMs: 50662,
  playedAt: null,
  ageMs: 0,
}

function snap(data: Partial<NowPlayingData>, receivedAt = 0): Snapshot {
  return {
    data: {
      isPlaying: true,
      track: { title: "T", artist: "A", album: "B", url: "u", durationMs: 200_000 },
      progressMs: 0,
      playedAt: null,
      ageMs: 0,
      ...data,
    },
    receivedAt,
    art: null,
  }
}

describe("positionMs", () => {
  test("adds server staleness to locally measured elapsed time", () => {
    const s = snap({ ageMs: 5_000, progressMs: 50_000 }, 1_000)
    expect(positionMs(s, 3_000)).toBe(57_000)
  })

  test("clamps to the track duration", () => {
    const s = snap({ ageMs: 0, progressMs: 199_000, track: { title: "T", artist: "A", album: "B", url: "u", durationMs: 200_000 } }, 0)
    expect(positionMs(s, 60_000)).toBe(200_000)
  })

  test("treats a null progressMs while playing as zero", () => {
    expect(positionMs(snap({ progressMs: null, ageMs: 0 }, 0), 4_000)).toBe(4_000)
  })

  test("is null when idle or trackless", () => {
    expect(positionMs(snap({ isPlaying: false }), 5_000)).toBeNull()
    expect(positionMs(snap({ track: null }), 5_000)).toBeNull()
  })

  test("ignores playedAt entirely — no wall-clock dependency", () => {
    const sane = snap({ ageMs: 1_000, progressMs: 10_000 }, 0)
    const bogus = { ...sane, data: { ...sane.data, playedAt: "1999-01-01T00:00:00.000Z" } }
    expect(positionMs(bogus, 2_000)).toBe(positionMs(sane, 2_000))
  })

  test("a receivedAt in the future cannot rewind the meter", () => {
    // Guards a backwards monotonic jump: elapsed floors at 0, never negative.
    expect(positionMs(snap({ ageMs: 0, progressMs: 10_000 }, 9_999), 0)).toBe(10_000)
  })
})

describe("parsePayload", () => {
  test("accepts the real API body", () => {
    const data = parsePayload(LIVE_BODY)
    expect(data).not.toBeNull()
    expect(data!.track!.title).toBe("Dear Child (I've Been Dying to Reach You)")
    expect(data!.track!.durationMs).toBe(203200)
    expect(data!.progressMs).toBe(50662)
    expect(data!.isPlaying).toBe(true)
  })

  test("accepts a valid trackless payload", () => {
    const data = parsePayload({ isPlaying: false, track: null, progressMs: null, playedAt: null, ageMs: 0 })
    expect(data).not.toBeNull()
    expect(data!.track).toBeNull()
    expect(data!.isPlaying).toBe(false)
  })

  test("rejects a duration that would divide into NaN", () => {
    for (const durationMs of [0, -1, Number.NaN, undefined]) {
      expect(parsePayload({ ...LIVE_BODY, track: { ...LIVE_BODY.track, durationMs } })).toBeNull()
    }
  })

  test("rejects missing required track fields", () => {
    expect(parsePayload({ ...LIVE_BODY, track: { ...LIVE_BODY.track, url: undefined } })).toBeNull()
    expect(parsePayload({ ...LIVE_BODY, track: { ...LIVE_BODY.track, title: "" } })).toBeNull()
    expect(parsePayload({ ...LIVE_BODY, track: "a string" })).toBeNull()
  })

  test("rejects a malformed envelope", () => {
    expect(parsePayload(null)).toBeNull()
    expect(parsePayload("nope")).toBeNull()
    expect(parsePayload({ ...LIVE_BODY, isPlaying: "yes" })).toBeNull()
    expect(parsePayload({ ...LIVE_BODY, ageMs: -1 })).toBeNull()
    expect(parsePayload({ ...LIVE_BODY, ageMs: undefined })).toBeNull()
  })

  test("cannot report playing without a track", () => {
    const data = parsePayload({ ...LIVE_BODY, isPlaying: true, track: null })
    expect(data!.isPlaying).toBe(false)
  })

  test("normalises a missing albumArt to null rather than failing", () => {
    const { albumArt, ...rest } = LIVE_BODY.track
    const data = parsePayload({ ...LIVE_BODY, track: rest })
    expect(data).not.toBeNull()
    expect(data!.track!.albumArt).toBeNull()
  })
})

describe("store", () => {
  test("notifies subscribers and flips hasTrack", () => {
    let hits = 0
    const off = subscribe(() => hits++)

    __publish(snap({}))
    expect(hits).toBe(1)
    expect(getHasTrack()).toBe(true)

    __publish(null)
    expect(hits).toBe(2)
    expect(getHasTrack()).toBe(false)

    off()
    __publish(snap({}))
    expect(hits).toBe(2)
    __publish(null)
  })

  test("getSnapshot is referentially stable between publishes", () => {
    // The useSyncExternalStore contract: a fresh object per call throws
    // "The result of getSnapshot should be cached" and can spin forever.
    const s = snap({})
    __publish(s)
    expect(getSnapshot()).toBe(getSnapshot())
    expect(getSnapshot()).toBe(s)
    __publish(null)
  })

  test("trackSeq bumps on a new url, not on a progress update", () => {
    __publish(null)
    const base = getTrackSeq()

    __publish(snap({ track: { title: "T", artist: "A", album: "B", url: "one", durationMs: 1_000 } }))
    expect(getTrackSeq()).toBe(base + 1)

    // Same song, later in the song.
    __publish(snap({ progressMs: 9_000, track: { title: "T", artist: "A", album: "B", url: "one", durationMs: 1_000 } }))
    expect(getTrackSeq()).toBe(base + 1)

    __publish(snap({ track: { title: "U", artist: "A", album: "B", url: "two", durationMs: 1_000 } }))
    expect(getTrackSeq()).toBe(base + 2)
    __publish(null)
  })
})

describe("test-environment safety", () => {
  test("is disabled and never polls under NODE_ENV=test", async () => {
    // The whole suite — including the server smoke.test.ts spawns, which
    // inherits process.env — must stay off the network on this guarantee.
    expect(isEnabled()).toBe(false)
    expect(__isPolling()).toBe(false)
    await Bun.sleep(50)
    expect(__isPolling()).toBe(false)
    expect(getSnapshot()).toBeNull()
  })

  test("clock is monotonic", () => {
    expect(clock()).toBeGreaterThanOrEqual(0)
    expect(clock()).toBeLessThanOrEqual(clock())
  })
})
