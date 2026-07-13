import { useState } from "react"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { experience, honors, projects } from "./content"
import { SECTIONS, type SectionId } from "./nav"
import { THEMES, ThemeContext, nextTheme, type ThemeName } from "./theme"
import { Header } from "./components/Header"
import { Rule } from "./components/Rule"
import { Splash } from "./components/Splash"
import { StatusBar, type Hint } from "./components/StatusBar"
import { TabBar } from "./components/TabBar"
import { About } from "./sections/About"
import { Contact } from "./sections/Contact"
import { Experience } from "./sections/Experience"
import { Honors } from "./sections/Honors"
import { Projects } from "./sections/Projects"

const MIN_COLS = 64
const MIN_ROWS = 16

const LIST_COUNTS: Record<SectionId, number> = {
  about: 0,
  experience: experience.length,
  projects: projects.length,
  honors: honors.length,
  contact: 0,
}

export function App({ onExit }: { onExit: () => void }) {
  const { width, height } = useTerminalDimensions()
  const [themeName, setThemeName] = useState<ThemeName>("signal")
  const [phase, setPhase] = useState<"splash" | "main">("splash")
  const [sectionIdx, setSectionIdx] = useState(0)
  const [cursors, setCursors] = useState<Record<SectionId, number>>({
    about: 0,
    experience: 0,
    projects: 0,
    honors: 0,
    contact: 0,
  })

  const theme = THEMES[themeName]
  const section = SECTIONS[sectionIdx]!
  const listCount = LIST_COUNTS[section.id]

  const moveCursor = (to: (current: number) => number) => {
    if (listCount === 0) return
    setCursors((c) => ({
      ...c,
      [section.id]: Math.max(0, Math.min(listCount - 1, to(c[section.id]))),
    }))
  }

  useKeyboard((key) => {
    if (key.eventType === "release") return
    if (phase === "splash") return // Splash owns the keyboard until it finishes
    if (key.name === "q" || key.name === "escape" || (key.ctrl && key.name === "c")) {
      onExit()
      return
    }
    if (key.name === "t") {
      setThemeName(nextTheme)
      return
    }
    if (key.name === "tab") {
      setSectionIdx((i) => (i + (key.shift ? -1 : 1) + SECTIONS.length) % SECTIONS.length)
      return
    }
    if (key.name === "right") {
      setSectionIdx((i) => (i + 1) % SECTIONS.length)
      return
    }
    if (key.name === "left") {
      setSectionIdx((i) => (i - 1 + SECTIONS.length) % SECTIONS.length)
      return
    }
    if (key.number && SECTIONS[Number(key.name) - 1]) {
      setSectionIdx(Number(key.name) - 1)
      return
    }
    const jump = SECTIONS.findIndex((s) => s.key === key.name && !key.shift)
    if (jump >= 0) {
      setSectionIdx(jump)
      return
    }
    if (key.name === "j" || key.name === "down") moveCursor((n) => n + 1)
    else if (key.name === "k" || key.name === "up") moveCursor((n) => n - 1)
    else if (key.name === "g" && key.shift) moveCursor(() => listCount - 1)
    else if (key.name === "g") moveCursor(() => 0)
  })

  if (width < MIN_COLS || height < MIN_ROWS) {
    return (
      <ThemeContext.Provider value={theme}>
        <box
          flexGrow={1}
          justifyContent="center"
          alignItems="center"
          backgroundColor={theme.bg}
        >
          <text fg={theme.accent}>
            ENLARGE TERMINAL TO AT LEAST {MIN_COLS}x{MIN_ROWS}
          </text>
        </box>
      </ThemeContext.Provider>
    )
  }

  if (phase === "splash") {
    return (
      <ThemeContext.Provider value={theme}>
        <Splash onDone={() => setPhase("main")} onExit={onExit} />
      </ThemeContext.Provider>
    )
  }

  // The app lives in a fixed frame centered on the screen — the hierarchy
  // converges on the middle instead of bleeding to the terminal edges.
  const frameW = Math.min(84, width - 4)
  const frameH = Math.min(32, height - 2)

  // Full masthead only on roomy frames; the banner alone is 66x6.
  const compact = frameW < 76 || frameH < 26
  const headerRows = compact ? 1 : 7
  const contentHeight = Math.max(4, frameH - headerRows - 6)

  const hints: Hint[] = [
    ...(listCount > 0 ? [{ key: "j/k", label: "move" }] : []),
    { key: "tab", label: "section" },
    { key: "t", label: "theme" },
    { key: "q", label: "quit" },
  ]

  return (
    <ThemeContext.Provider value={theme}>
      <box
        flexGrow={1}
        justifyContent="center"
        alignItems="center"
        backgroundColor={theme.bg}
      >
        <box flexDirection="column" width={frameW} height={frameH}>
          <Header compact={compact} />
          <Rule heavy width={frameW} />
          <TabBar active={section.id} width={frameW} />
          <Rule width={frameW} />
          <box flexGrow={1} flexDirection="column" paddingTop={1} overflow="hidden">
            {section.id === "about" ? <About /> : null}
            {section.id === "experience" ? (
              <Experience selected={cursors.experience} height={contentHeight} width={frameW} />
            ) : null}
            {section.id === "projects" ? (
              <Projects selected={cursors.projects} height={contentHeight} width={frameW} />
            ) : null}
            {section.id === "honors" ? (
              <Honors selected={cursors.honors} height={contentHeight} width={frameW} />
            ) : null}
            {section.id === "contact" ? <Contact /> : null}
          </box>
          <Rule width={frameW} />
          <StatusBar hints={hints} right={`theme: ${theme.name} ✳`} />
        </box>
      </box>
    </ThemeContext.Provider>
  )
}
