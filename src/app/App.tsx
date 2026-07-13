import { useState } from "react"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { identity, theme } from "./content"
import { About } from "./sections/About"
import { Projects } from "./sections/Projects"
import { Contact } from "./sections/Contact"

const MIN_COLS = 60
const MIN_ROWS = 15

type Screen = "home" | "about" | "projects" | "contact"

const MENU: Array<{ label: string; screen: Screen }> = [
  { label: "about", screen: "about" },
  { label: "projects", screen: "projects" },
  { label: "contact", screen: "contact" },
]

export function App({ onExit }: { onExit: () => void }) {
  const { width, height } = useTerminalDimensions()
  const [screen, setScreen] = useState<Screen>("home")
  const [selected, setSelected] = useState(0)

  useKeyboard((key) => {
    if (key.eventType === "release") return
    if (key.name === "q" || (key.ctrl && key.name === "c")) {
      onExit()
      return
    }
    if (screen === "home") {
      if (key.name === "down" || key.name === "j") {
        setSelected((s) => (s + 1) % MENU.length)
      } else if (key.name === "up" || key.name === "k") {
        setSelected((s) => (s - 1 + MENU.length) % MENU.length)
      } else if (key.name === "return" || key.name === "l" || key.name === "right") {
        setScreen(MENU[selected]!.screen)
      } else if (key.number && MENU[Number(key.name) - 1]) {
        setScreen(MENU[Number(key.name) - 1]!.screen)
      }
    } else if (
      key.name === "escape" ||
      key.name === "backspace" ||
      key.name === "h" ||
      key.name === "left"
    ) {
      setScreen("home")
    }
  })

  if (width < MIN_COLS || height < MIN_ROWS) {
    return (
      <box flexGrow={1} justifyContent="center" alignItems="center">
        <text fg={theme.yellow}>
          please enlarge your terminal to at least {MIN_COLS}x{MIN_ROWS}
        </text>
      </box>
    )
  }

  return (
    <box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
      <ascii-font text={identity.banner} font="block" color={theme.accent} />
      <text fg={theme.dim}>{identity.tagline}</text>
      <text> </text>
      <box
        border
        borderStyle="rounded"
        borderColor={theme.dim}
        flexDirection="column"
        width={Math.min(64, width - 4)}
        padding={1}
      >
        {screen === "home" ? <Menu selected={selected} /> : null}
        {screen === "about" ? <About /> : null}
        {screen === "projects" ? <Projects /> : null}
        {screen === "contact" ? <Contact /> : null}
      </box>
      <text> </text>
      <text fg={theme.dim}>
        {screen === "home"
          ? "↑/↓ or j/k · enter to open · q to quit"
          : "esc or h to go back · q to quit"}
      </text>
    </box>
  )
}

function Menu({ selected }: { selected: number }) {
  return (
    <box flexDirection="column" paddingLeft={1}>
      <text fg={theme.fg}>
        {identity.name} — {identity.tagline}
      </text>
      <text> </text>
      {MENU.map((item, i) => (
        <text key={item.screen} fg={i === selected ? theme.accent : theme.fg}>
          {i === selected ? "❯ " : "  "}
          {i + 1}. {item.label}
        </text>
      ))}
    </box>
  )
}
