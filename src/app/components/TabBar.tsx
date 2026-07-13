import { SECTIONS, type SectionId } from "../nav"
import { useTheme } from "../theme"

// Terminal.shop-style tab bar: letter accelerator + label per section,
// active tab rendered as a full accent background block (no borders).
export function TabBar({ active, width }: { active: SectionId; width: number }) {
  const theme = useTheme()
  const showIndex = width >= 76

  return (
    <box flexDirection="row" width="100%" height={1} flexShrink={0}>
      {SECTIONS.map((s, i) => {
        const isActive = s.id === active
        const index = showIndex ? `N${i + 1} ` : ""
        if (isActive) {
          return (
            <box key={s.id} backgroundColor={theme.barBg} marginRight={showIndex ? 2 : 1}>
              <text fg={theme.barFg}>
                {" "}
                {index}
                {s.label.toUpperCase()}{" "}
              </text>
            </box>
          )
        }
        return (
          <box key={s.id} marginRight={showIndex ? 2 : 1}>
            <text>
              {" "}
              <span fg={theme.accent}>{s.key}</span>
              <span fg={theme.dim}> {s.label.toUpperCase()} </span>
            </text>
          </box>
        )
      })}
    </box>
  )
}
