// Two brutalist themes, switchable per-session at runtime with `t`.
// Theme MUST be React state + context, never a module singleton: one Bun
// process serves many concurrent SSH sessions, and a global would let one
// visitor's toggle repaint everyone else's screen.
import { RGBA } from "@opentui/core"
import { createContext, useContext } from "react"

export type ThemeName = "signal" | "circuit"

// `bg` is the terminal's own default background (SGR 49): root containers
// must still PAINT it every frame — an unpainted cell keeps the previous
// frame's glyph — but painting the default keeps the visitor's colors.
// accentText/barFg are text ON accent blocks, so they stay explicit darks
// that read on both the red and blue bars regardless of terminal colors.
export type Theme = {
  name: ThemeName
  bg: RGBA
  fg: string
  dim: string
  faint: string
  accent: string
  accentText: string
  barBg: string
  barFg: string
}

const signal: Theme = {
  name: "signal",
  bg: RGBA.defaultBackground(),
  fg: "#d8d2c8",
  dim: "#6e6862",
  faint: "#35302b",
  accent: "#ff3b30",
  accentText: "#0d0c0b",
  barBg: "#ff3b30",
  barFg: "#0d0c0b",
}

const circuit: Theme = {
  name: "circuit",
  bg: RGBA.defaultBackground(),
  fg: "#c9d1d9",
  dim: "#5b6470",
  faint: "#242a33",
  accent: "#2f9bff",
  accentText: "#08090c",
  barBg: "#2f9bff",
  barFg: "#08090c",
}

export const THEMES: Record<ThemeName, Theme> = { signal, circuit }

export const ThemeContext = createContext<Theme>(THEMES.signal)

export function useTheme(): Theme {
  return useContext(ThemeContext)
}

export function nextTheme(name: ThemeName): ThemeName {
  return name === "signal" ? "circuit" : "signal"
}
