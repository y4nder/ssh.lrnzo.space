import { useSyncExternalStore } from "react"
import { getOnline, subscribe } from "../../presence"

// Live count of connected SSH sessions (including this one). Updates in
// place when other visitors connect or disconnect.
export function usePresence(): number {
  return useSyncExternalStore(subscribe, getOnline)
}
