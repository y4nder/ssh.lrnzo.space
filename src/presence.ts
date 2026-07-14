// Live visitor presence. One Bun process serves every SSH session, so a
// module singleton is the source of truth — this is the one place where
// cross-session shared state is the FEATURE (unlike theme, which must stay
// per-session React state). Sessions join/leave in session.ts; every React
// tree subscribes via useSyncExternalStore and re-renders on churn.

type Listener = () => void

let online = 0
const listeners = new Set<Listener>()

function notify() {
  for (const l of listeners) l()
}

export function join(): void {
  online++
  notify()
}

export function leave(): void {
  online = Math.max(0, online - 1)
  notify()
}

export function getOnline(): number {
  return online
}

export function subscribe(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
