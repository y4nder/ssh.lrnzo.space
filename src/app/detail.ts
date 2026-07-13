import { experience, honors, projects } from "./content"
import type { SectionId } from "./nav"

// Normalized "record page" for the enter-to-expand detail view. Bullet
// paragraphs carry the "✱ " prefix; DetailView renders it in accent.
export type DetailRecord = {
  crumb: string
  title: string
  // Rendered after the title: ".END" stamp or " ✱ COMPANY".
  suffix: { kind: "end" } | { kind: "star"; text: string } | null
  meta: string
  paragraphs: string[]
  stack?: string
}

const pad = (i: number) => String(i + 1).padStart(2, "0")

export function detailFor(section: SectionId, index: number): DetailRecord | null {
  if (section === "experience") {
    const e = experience[index]
    if (!e) return null
    return {
      crumb: `N2 / Experience / ${pad(index)}`,
      title: e.role,
      suffix: { kind: "star", text: e.company },
      meta: [e.dates, e.location, e.type].filter(Boolean).join(" · "),
      paragraphs: [...(e.summary ? [e.summary] : []), ...e.bullets.map((b) => `✱ ${b}`)],
      stack: e.skills.join(" · "),
    }
  }
  if (section === "projects") {
    const p = projects[index]
    if (!p) return null
    return {
      crumb: `N3 / Projects / ${pad(index)}`,
      title: p.name,
      suffix: { kind: "end" },
      meta: [p.dates, p.url].filter(Boolean).join(" · "),
      paragraphs: [p.tagline, ...p.bullets.map((b) => `✱ ${b}`)],
      stack: p.tech.join(" · "),
    }
  }
  if (section === "honors") {
    const h = honors[index]
    if (!h) return null
    return {
      crumb: `N4 / Honors / ${pad(index)}`,
      title: h.title,
      suffix: null,
      meta: `${h.issuer} · ${h.date}`,
      paragraphs: h.blurb ? [h.blurb] : [],
    }
  }
  return null
}
