import { about, contact, education, experience, honors, identity, projects } from "./content"
import { wrapText } from "./util"

// Oxford-format CV flattened into one line per terminal row. Resume.tsx
// renders a slice of this array, so wrapping must be resolved here at build
// time (the layout never relies on yoga text flow — see util.ts).
export type ResumeLine =
  | { kind: "blank" }
  | { kind: "rule" }
  | { kind: "center"; text: string; bold?: boolean; dim?: boolean }
  | { kind: "heading"; text: string }
  | { kind: "split"; left: string; right: string }
  | { kind: "text"; text: string; dim?: boolean }
  | { kind: "bullet"; text: string; first: boolean }
  | { kind: "end" }

// Rows the CV page spends outside the document: masthead + heavy rule +
// ↑/↓ indicators + bottom rule + status bar.
export const RESUME_CHROME = 6

export function resumeRows(frameH: number): number {
  return Math.max(1, frameH - RESUME_CHROME)
}

export function buildResumeLines(width: number): ResumeLine[] {
  const lines: ResumeLine[] = []
  const blank = () => lines.push({ kind: "blank" })
  const heading = (text: string) => {
    blank()
    lines.push({ kind: "heading", text })
    lines.push({ kind: "rule" })
  }
  const text = (value: string, dim = false) => {
    for (const line of wrapText(value, width)) lines.push({ kind: "text", text: line, dim })
  }
  const bullet = (value: string) => {
    wrapText(value, width - 2).forEach((line, i) =>
      lines.push({ kind: "bullet", text: line, first: i === 0 }),
    )
  }

  lines.push({ kind: "center", text: identity.name, bold: true })
  lines.push({ kind: "center", text: identity.tagline, dim: true })
  // Centered lines never wrap, so split the contact row when it won't fit.
  const contactLine = `${contact.email} · ${contact.github} · ${contact.linkedin}`
  if (contactLine.length <= width) lines.push({ kind: "center", text: contactLine, dim: true })
  else {
    lines.push({ kind: "center", text: contact.email, dim: true })
    lines.push({ kind: "center", text: `${contact.github} · ${contact.linkedin}`, dim: true })
  }

  heading("Education")
  education.forEach((entry, i) => {
    if (i > 0) blank()
    lines.push({ kind: "split", left: entry.school, right: entry.dates })
    text(entry.degree)
    for (const note of entry.notes ?? []) bullet(note)
  })

  heading("Experience")
  experience.forEach((entry, i) => {
    if (i > 0) blank()
    lines.push({ kind: "split", left: entry.company, right: entry.dates })
    text(entry.type ? `${entry.role} · ${entry.type}` : entry.role)
    if (entry.summary) text(entry.summary, true)
    for (const item of entry.bullets) bullet(item)
  })

  heading("Projects")
  projects.forEach((project, i) => {
    if (i > 0) blank()
    lines.push({ kind: "split", left: project.name, right: project.dates ?? "" })
    text(project.tagline, true)
  })

  heading("Technical Skills")
  for (const skill of about.skills) bullet(skill)

  heading("Honors & Awards")
  honors.forEach((honor, i) => {
    if (i > 0) blank()
    lines.push({ kind: "split", left: honor.title, right: honor.date })
    text(honor.issuer, true)
  })

  blank()
  lines.push({ kind: "end" })
  return lines
}
