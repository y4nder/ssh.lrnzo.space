// All portfolio copy lives here — edit this file, never the components.

export const theme = {
  fg: "#c0caf5",
  dim: "#565f89",
  accent: "#7aa2f7",
  green: "#9ece6a",
  purple: "#bb9af7",
  yellow: "#e0af68",
  red: "#f7768e",
} as const

export const identity = {
  banner: "lorenzo",
  name: "Lorenzo Lubguban",
  tagline: "software engineer",
  sshCommand: "ssh lrnzo.space",
}

export const about = {
  bio: [
    "Hi, I'm Lorenzo — a software engineer who likes building things",
    "end to end: from database schemas to terminal UIs like this one.",
    "",
    "This portfolio is a TypeScript app rendered by OpenTUI and served",
    "by its own SSH server (ssh2), running in Docker on my VPS.",
  ],
  skills: [
    "TypeScript / Node / Bun",
    "React / NestJS",
    "PostgreSQL / Redis",
    "Docker / Linux / CI-CD",
  ],
}

export type Project = {
  name: string
  tagline: string
  tech: string
  url?: string
}

export const projects: Project[] = [
  {
    name: "Faculytics",
    tagline: "Analytics platform for faculty evaluation data.", // TODO: real one-liner
    tech: "NestJS · PostgreSQL (pgvector) · Redis · Docker",
  },
  {
    name: "Alya",
    tagline: "Web application MVP.", // TODO: real one-liner
    tech: "Next.js · Docker",
  },
  {
    name: "ssh_portfolio",
    tagline: "This thing you're looking at — a TUI portfolio served over SSH.",
    tech: "OpenTUI · React · ssh2 · Bun",
  },
]

export const contact = {
  email: "lorenzolubguban@gmail.com",
  github: "github.com/<username>", // TODO
  linkedin: "linkedin.com/in/<username>", // TODO
}
