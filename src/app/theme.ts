// Brutalist themes, switchable per-session at runtime with `t`.
// Theme MUST be React state + context, never a module singleton: one Bun
// process serves many concurrent SSH sessions, and a global would let one
// visitor's toggle repaint everyone else's screen.
import { RGBA } from "@opentui/core"
import { createContext, useContext } from "react"

export type ThemeName = "signal" | "circuit" | "acid"

// `bg` is the terminal's own default background (SGR 49): root containers
// must still PAINT it every frame — an unpainted cell keeps the previous
// frame's glyph — but painting the default keeps the visitor's colors.
// accentText/barFg are text ON accent blocks, so they stay explicit darks
// that read on the accent bars regardless of terminal colors.
//
// DARK TERMINALS ONLY (deliberate, 2026-07): fg/dim/faint assume a dark
// background — on a light terminal the body text is near-invisible. To lift
// this later: renderer.getPalette() OSC-queries the client terminal's
// defaultBackground over the SSH channel; pick light/dark token variants by
// its luminance and fall back to these dark tokens when it doesn't answer.
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

// Y2K underground-poster acid green: pure saturated green on near-black,
// body text tinted toward the phosphor like a halftone print.
const acid: Theme = {
  name: "acid",
  bg: RGBA.defaultBackground(),
  fg: "#c9dcc2",
  dim: "#5e6e57",
  faint: "#22301f",
  accent: "#39ff14",
  accentText: "#060d05",
  barBg: "#39ff14",
  barFg: "#060d05",
}

export const THEMES: Record<ThemeName, Theme> = { signal, circuit, acid }

export const ThemeContext = createContext<Theme>(THEMES.signal)

export function useTheme(): Theme {
  return useContext(ThemeContext)
}

export function nextTheme(name: ThemeName): ThemeName {
  const names = Object.keys(THEMES) as ThemeName[]
  return names[(names.indexOf(name) + 1) % names.length]!
}
