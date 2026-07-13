import { useRef } from "react"

// Windowed-list offset that follows the cursor: keeps `selected` inside
// [offset, offset + visible) while clamping to the list bounds.
export function useListWindow(selected: number, count: number, visible: number): number {
  const offsetRef = useRef(0)
  let offset = offsetRef.current
  if (selected < offset) offset = selected
  else if (selected >= offset + visible) offset = selected - visible + 1
  offset = Math.max(0, Math.min(offset, Math.max(0, count - visible)))
  offsetRef.current = offset
  return offset
}
