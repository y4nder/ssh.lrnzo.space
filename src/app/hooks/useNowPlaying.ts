import { useEffect, useRef, useSyncExternalStore } from "react"
import { getHasTrack, getSnapshot, getTrackSeq, subscribe, type Snapshot } from "../../nowplaying"

// Three hooks over one store, deliberately. Sessions that only need to know
// WHETHER something is playing must not re-render on every poll — see the note
// on useHasNowPlaying.

/** The full snapshot. Re-renders the caller on every poll. */
export function useNowPlaying(): Snapshot | null {
  return useSyncExternalStore(subscribe, getSnapshot)
}

/**
 * Primitive selector for App, which owns the whole frame.
 *
 * useSyncExternalStore bails out when the value is unchanged, so subscribing to
 * a boolean means a poll every 20s does NOT repaint the masthead, tabs and
 * section for every connected session — App re-renders only when a track
 * appears or disappears. The ticker subscribes to the full snapshot itself.
 */
export function useHasNowPlaying(): boolean {
  return useSyncExternalStore(subscribe, getHasTrack)
}

/**
 * Fires once per genuine track change.
 *
 * `seen` is initialised to the sequence AT MOUNT, which is what keeps first
 * load silent — a visitor connecting mid-song should not be greeted by a glitch
 * burst. It also advances while disarmed, so arming later cannot replay a
 * change that happened during the splash.
 */
export function useTrackChange(armed: boolean, onChange: () => void): void {
  const seq = useSyncExternalStore(subscribe, getTrackSeq)
  const seen = useRef(seq)
  const cb = useRef(onChange)
  cb.current = onChange

  useEffect(() => {
    if (seq === seen.current) return
    seen.current = seq
    if (armed) cb.current()
  }, [seq, armed])
}
