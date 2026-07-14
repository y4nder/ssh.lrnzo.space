import { useMemo, useState } from "react"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { experience, honors, projects } from "./content"
import { detailFor } from "./detail"
import { SECTIONS, type SectionId } from "./nav"
import { buildResumeLines, resumeRows } from "./resume"
import { type ConsoleSession } from "./console"
import { THEMES, ThemeContext, nextTheme, type ThemeName } from "./theme"
import { ConsolePage } from "./components/ConsolePage"
import { DetailView } from "./components/DetailView"
import { GuestbookPage } from "./components/GuestbookPage"
import { Header } from "./components/Header"
import { ResumePage } from "./components/ResumePage"
import { Rule } from "./components/Rule"
import { Splash } from "./components/Splash"
import { StatusBar, type Hint } from "./components/StatusBar"
import { TabBar } from "./components/TabBar"
import { useGlitchBurst } from "./hooks/useGlitchBurst"
import { usePresence } from "./hooks/usePresence"
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

export function App({
  onExit,
  ip,
  visitorNumber,
}: {
  onExit: () => void
  ip: string
  visitorNumber: number
}) {
  const { width, height } = useTerminalDimensions()
  const online = usePresence()
  const [themeName, setThemeName] = useState<ThemeName>("signal")
  const glitch = useGlitchBurst()
  // Every theme change goes through here so the repaint lands under a burst
  // painted in the INCOMING accent — the new signal punching in.
  const switchTheme = (next: ThemeName | ((current: ThemeName) => ThemeName)) => {
    const to = typeof next === "function" ? next(themeName) : next
    glitch(THEMES[to].accent)
    setThemeName(to)
  }
  const [phase, setPhase] = useState<"splash" | "main">("splash")
  const [sectionIdx, setSectionIdx] = useState(0)
  const [cursors, setCursors] = useState<Record<SectionId, number>>({
    about: 0,
    experience: 0,
    projects: 0,
    honors: 0,
    contact: 0,
  })
  // Enter on a list row expands it into a full record page; esc collapses.
  const [expanded, setExpanded] = useState(false)
  const [detailScroll, setDetailScroll] = useState(0)
  // `r` swaps the whole frame for the CV page; esc returns to where you were.
  const [cvOpen, setCvOpen] = useState(false)
  const [resumeScroll, setResumeScroll] = useState(0)
  // `b` swaps the whole frame for the guestbook, same takeover pattern.
  const [gbOpen, setGbOpen] = useState(false)
  // ` (backtick) opens the hidden console — deliberately absent from every
  // hint bar. Scrollback/history/cwd live here so they survive close/reopen
  // for the whole SSH session (ConsolePage remounts on each open).
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [consoleSession, setConsoleSession] = useState<ConsoleSession>({
    entries: [],
    history: [],
    cwd: "~",
    booted: false,
  })

  const theme = THEMES[themeName]
  const section = SECTIONS[sectionIdx]!
  const listCount = LIST_COUNTS[section.id]
  const record = expanded ? detailFor(section.id, cursors[section.id]) : null
  const maxScroll = record ? Math.max(0, record.paragraphs.length - 1) : 0

  // The app lives in a fixed frame centered on the screen — the hierarchy
  // converges on the middle instead of bleeding to the terminal edges.
  const frameW = Math.min(84, width - 4)
  const frameH = Math.min(32, height - 2)

  // Full masthead only on roomy frames; the banner alone is 37x4.
  const compact = frameW < 76 || frameH < 26
  const headerRows = compact ? 1 : 6
  const contentHeight = Math.max(4, frameH - headerRows - 6)

  const resumeLines = useMemo(() => buildResumeLines(frameW), [frameW])
  const resumeMaxScroll = Math.max(0, resumeLines.length - resumeRows(frameH))

  const collapse = () => {
    setExpanded(false)
    setDetailScroll(0)
  }

  const jumpTo = (idx: number) => {
    collapse()
    setSectionIdx(idx)
  }

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
    // The guestbook owns the keyboard entirely — this guard must stay ABOVE
    // the quit check: in compose mode `q` and digits are message text.
    if (gbOpen) return
    // Same for the console: `q` and everything else is prompt text.
    if (consoleOpen) return
    if (key.name === "q" || (key.ctrl && key.name === "c")) {
      onExit()
      return
    }
    // The CV page owns the keyboard while open — only scroll/theme/exit work.
    if (cvOpen) {
      if (key.name === "escape" || key.name === "backspace" || key.name === "r") setCvOpen(false)
      else if (key.name === "t") switchTheme(nextTheme)
      else if (key.name === "j" || key.name === "down")
        setResumeScroll((s) => Math.min(resumeMaxScroll, s + 1))
      else if (key.name === "k" || key.name === "up") setResumeScroll((s) => Math.max(0, s - 1))
      else if (key.name === "g" && key.shift) setResumeScroll(resumeMaxScroll)
      else if (key.name === "g") setResumeScroll(0)
      return
    }
    if (key.name === "r") {
      setResumeScroll(0)
      setCvOpen(true)
      return
    }
    if (key.name === "b") {
      setGbOpen(true)
      return
    }
    // The hidden console. The opening ` can't leak into its prompt: the
    // input only mounts on the re-render after this handler returns.
    if (key.name === "`") {
      key.preventDefault()
      glitch(theme.accent)
      setConsoleOpen(true)
      return
    }
    if (key.name === "escape" || key.name === "backspace") {
      if (expanded) collapse()
      else onExit()
      return
    }
    if (key.name === "t") {
      switchTheme(nextTheme)
      return
    }
    if (key.name === "tab") {
      jumpTo((sectionIdx + (key.shift ? -1 : 1) + SECTIONS.length) % SECTIONS.length)
      return
    }
    if (key.name === "right") {
      jumpTo((sectionIdx + 1) % SECTIONS.length)
      return
    }
    if (key.name === "left") {
      jumpTo((sectionIdx - 1 + SECTIONS.length) % SECTIONS.length)
      return
    }
    if (key.number && SECTIONS[Number(key.name) - 1]) {
      jumpTo(Number(key.name) - 1)
      return
    }
    const jump = SECTIONS.findIndex((s) => s.key === key.name && !key.shift)
    if (jump >= 0) {
      jumpTo(jump)
      return
    }
    if (key.name === "return") {
      if (!expanded && listCount > 0) setExpanded(true)
      return
    }
    // j/k scroll the record page when expanded, move the list cursor otherwise.
    if (expanded) {
      if (key.name === "j" || key.name === "down")
        setDetailScroll((s) => Math.min(maxScroll, s + 1))
      else if (key.name === "k" || key.name === "up") setDetailScroll((s) => Math.max(0, s - 1))
      else if (key.name === "g" && key.shift) setDetailScroll(maxScroll)
      else if (key.name === "g") setDetailScroll(0)
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

  const hints: Hint[] = expanded
    ? [
        { key: "j/k", label: "scroll" },
        { key: "esc", label: "back" },
        { key: "t", label: "theme" },
        { key: "q", label: "quit" },
      ]
    : [
        ...(listCount > 0
          ? [
              { key: "j/k", label: "move" },
              { key: "enter", label: "open" },
            ]
          : []),
        // Contact runs its own selection/yank keys; its hints replace the
        // r/b ones so the bar still fits narrow frames — About advertises
        // both takeovers anyway.
        ...(section.id === "contact"
          ? [
              { key: "j/k", label: "move" },
              { key: "y", label: "copy" },
            ]
          : []),
        { key: "tab", label: "section" },
        // The full bar overflows narrow frames on list sections; the landing
        // (about) page still advertises the CV takeover. The guestbook hint
        // needs a few more columns, so it only shows on roomy frames — About
        // itself advertises it in the visitor line.
        ...(listCount === 0 && section.id !== "contact" ? [{ key: "r", label: "resume" }] : []),
        ...(listCount === 0 && section.id !== "contact" && frameW >= 72
          ? [{ key: "b", label: "guestbook" }]
          : []),
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
          {consoleOpen ? (
            <ConsolePage
              ip={ip}
              visitorNumber={visitorNumber}
              width={frameW}
              height={frameH}
              session={consoleSession}
              onSession={setConsoleSession}
              onClose={() => setConsoleOpen(false)}
              onTheme={switchTheme}
            />
          ) : gbOpen ? (
            <GuestbookPage
              ip={ip}
              width={frameW}
              height={frameH}
              onClose={() => setGbOpen(false)}
              onExit={onExit}
              onToggleTheme={() => switchTheme(nextTheme)}
            />
          ) : cvOpen ? (
            <ResumePage
              lines={resumeLines}
              scroll={resumeScroll}
              width={frameW}
              height={frameH}
            />
          ) : (
            <>
              <Header compact={compact} pulseKey={section.id} />
              <Rule heavy width={frameW} />
              <TabBar active={section.id} width={frameW} />
              <Rule width={frameW} />
              <box flexGrow={1} flexDirection="column" paddingTop={1} overflow="hidden">
                {record ? (
                  <DetailView
                    record={record}
                    height={contentHeight}
                    width={frameW}
                    scroll={detailScroll}
                  />
                ) : (
                  <>
                    {section.id === "about" ? <About visitorNumber={visitorNumber} /> : null}
                    {section.id === "experience" ? (
                      <Experience
                        selected={cursors.experience}
                        height={contentHeight}
                        width={frameW}
                      />
                    ) : null}
                    {section.id === "projects" ? (
                      <Projects
                        selected={cursors.projects}
                        height={contentHeight}
                        width={frameW}
                      />
                    ) : null}
                    {section.id === "honors" ? (
                      <Honors selected={cursors.honors} height={contentHeight} width={frameW} />
                    ) : null}
                    {section.id === "contact" ? (
                      <Contact width={frameW} height={contentHeight} />
                    ) : null}
                  </>
                )}
              </box>
              <Rule width={frameW} />
              <StatusBar
                hints={hints}
                // presence only on roomy frames: hints already crowd the
                // bar at min width and the right text never shrinks
                right={
                  compact
                    ? `theme: ${theme.name} ✱`
                    : `${online} online · theme: ${theme.name} ✱`
                }
              />
            </>
          )}
        </box>
      </box>
    </ThemeContext.Provider>
  )
}
