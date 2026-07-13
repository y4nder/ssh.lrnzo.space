// Section registry shared by the tab bar, keyboard handling, and status bar.
export type SectionId = "about" | "experience" | "projects" | "honors" | "contact"

export const SECTIONS: Array<{ id: SectionId; key: string; label: string }> = [
  { id: "about", key: "a", label: "about" },
  { id: "experience", key: "e", label: "experience" },
  { id: "projects", key: "p", label: "projects" },
  { id: "honors", key: "h", label: "honors" },
  { id: "contact", key: "c", label: "contact" },
]
