import { useSyncExternalStore } from "react"
import { getBody, getIndex, getVersion, subscribe, type BodyState, type IndexState } from "../../blog"

// The store's snapshot is a VERSION NUMBER, on the presence.ts pattern: a
// primitive can't trip useSyncExternalStore's "The result of getSnapshot should
// be cached" check, which nowplaying.ts has to hold an object identity steady to
// avoid. The counter drives the re-render; the real state is read straight after.

function useBlogVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion)
}

export function useBlogIndex(): IndexState {
  useBlogVersion()
  return getIndex()
}

export function useBlogBody(slug: string | null): BodyState | undefined {
  useBlogVersion()
  return slug === null ? undefined : getBody(slug)
}
