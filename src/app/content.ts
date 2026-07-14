// All portfolio copy lives here — edit this file, never the components.
// Rendering may uppercase strings; keep everything mixed-case here.

export const identity = {
  banner: "lrnzo",
  name: "Leander Lorenz B. Lubguban",
  tagline: "software engineer",
  host: "ssh.lrnzo.space",
  sshCommand: "ssh lrnzo.space",
}

export const about = {
  bio: [
    "Hi, I'm Leander Lorenz — a software engineer from Cebu,",
    "Philippines. I'm passionate about software development and",
    "building awesome applications, libraries, and tools.",
    "",
    "I like working end to end: backends, workflow engines, and",
    "terminal UIs like the one you're looking at.",
    "",
    "This portfolio is a TypeScript app rendered by OpenTUI and",
    "served by its own SSH server (ssh2), running in Docker on my",
    "VPS. No browser involved.",
  ],
  skills: [
    "TypeScript / Bun / Node",
    "React / Next.js / NestJS",
    "C# / .NET / ASP.NET Core",
    "Rust",
    "PostgreSQL / MySQL / Redis",
    "Docker / Linux / CI-CD",
  ],
}

export type EducationEntry = {
  school: string
  degree: string
  dates: string
  notes?: string[]
}

export const education: EducationEntry[] = [
  {
    school: "University of Cebu",
    degree: "Bachelor of Science in Computer Science",
    dates: "2022 — 2026",
    notes: ["Magna Cum Laude", "Dean's List 2022 – 2025"],
  },
  {
    school: "Misamis University",
    degree: "STEM — Senior High School (Grades 11–12)",
    dates: "Jun 2020 — May 2022",
  },
]

export type ExperienceEntry = {
  company: string
  role: string
  type?: string
  dates: string
  location?: string
  summary?: string
  bullets: string[]
  skills: string[]
}

export const experience: ExperienceEntry[] = [
  {
    company: "Full Scale",
    role: "Software Engineer",
    type: "Full-time",
    dates: "Jul 2026 — Present",
    location: "Cebu, Philippines · Remote",
    summary: "Software engineer on distributed client teams.",
    bullets: [],
    skills: ["Web Development"],
  },
  {
    company: "Freelance — LGU Consolacion",
    role: "Full-Stack Developer",
    type: "Freelance",
    dates: "Feb 2026 — May 2026",
    location: "Cebu, Philippines · Remote",
    summary:
      "Contracted to build \"ePermits\", a building permit / Certificate of Occupancy e-application system for the Office of the Building Official, LGU Consolacion.",
    bullets: [
      "Designed and implemented the application workflow engine — a role-based state machine governing how building permit and Certificate of Occupancy applications move through review, fee assessment, and approval — replacing an earlier ad-hoc department-based process",
      "Modeled the full approval lifecycle (11 statuses, 12 roles spanning Encoder, Reviewers, Fee Assessor, Approvers, and Releasing Officer) with guarded transitions, reset paths, and rejection/cancellation handling",
      "Contributed full-stack across the ASP.NET Core (.NET 8)/EF Core backend and the React/TypeScript frontend",
    ],
    skills: ["ASP.NET Core", "EF Core", "SQL Server", "SignalR", "React", "TypeScript"],
  },
  {
    company: "AVSR",
    role: "Full-Stack Developer",
    type: "Freelance",
    dates: "Jan 2026 — Apr 2026",
    location: "Cebu, Philippines · Remote",
    summary:
      "Contributed full-stack to a multi-branch appointment/queueing system for Metro Cebu Water District (MCWD), across a NestJS backend and Next.js frontend.",
    bullets: [
      "Built backend modules for branch management, slot scheduling, and admin analytics using NestJS, MikroORM, MySQL, and Redis, with cron jobs automating queue/slot processing",
      "Implemented role-based access control (CASL abilities) with custom guards and decorators to secure admin operations",
      "Developed admin dashboard views (queue management, analytics, slot management, reports) in Next.js/React, plus public flows like service hub selection and login",
      "Built QR-code ticket generation for queue slots with exportable image downloads",
    ],
    skills: ["NestJS", "MikroORM", "MySQL", "Redis", "Next.js", "TanStack Query", "Zustand"],
  },
  {
    company: "SKLoud",
    role: "Full-Stack Developer",
    dates: "Jun 2025 — May 2026",
    location: "Metro Cebu · Remote",
    summary:
      "Worked with the SKLOUD team to maintain and develop core features of their main application — used by SK youth and administrators for organizational management and communication.",
    bullets: [
      "Participated in monthly planning sessions and contributed to the system design of new features",
      "Implemented usability and performance improvements across the Nuxt frontend and Laravel backend",
      "Balanced feature development with bug fixing, keeping the application stable while it evolved to meet user needs",
    ],
    skills: ["Nuxt", "Laravel", "MySQL"],
  },
  {
    company: "Full Scale",
    role: "Software Engineer Intern",
    type: "Internship",
    dates: "Aug 2025 — Feb 2026",
    location: "Metro Cebu · Remote",
    summary:
      "Developed and maintained a production-grade internal web application for managing billing and rate systems.",
    bullets: [
      "Worked full-stack across a Blazor frontend and ASP.NET backend services",
      "Assisted in deploying and managing application environments on Microsoft Azure, supporting CI/CD workflows and production operations",
      "Collaborated with cross-functional teams in an Agile environment — daily scrums, task management in Jira",
    ],
    skills: ["Blazor", "ASP.NET", "Azure", "CI/CD", "Jira"],
  },
  {
    company: "AVSR",
    role: "Backend Developer",
    type: "Freelance",
    dates: "Mar 2025 — Dec 2025",
    location: "Cebu, Philippines · Remote",
    summary:
      "Built and maintained unified NestJS + PostgreSQL backend APIs serving a multi-platform lab result delivery system — React Native mobile app, Next.js web/admin portal, and an Electron desktop app — as part of a 3-person team.",
    bullets: [
      "Implemented authentication across all client platforms, including a custom license-based auth system restricting desktop API access to properly licensed installations",
      "Containerized the backend with Docker and automated deployments via GitHub Actions, deploying to a VPS with Docker Swarm/Stack for scalable infrastructure",
      "Built the Electron app's core feature: automatic cloud uploads triggered by adding lab results to a watched local folder",
      "Contributed UI updates and fixes across the React web portal, React Native mobile app, and Electron desktop client",
    ],
    skills: ["NestJS", "PostgreSQL", "Docker", "GitHub Actions", "React Native", "Electron"],
  },
]

export type Project = {
  name: string
  dates?: string
  url?: string
  tagline: string
  bullets: string[]
  tech: string[]
}

export const projects: Project[] = [
  {
    name: "leettui",
    dates: "May 2026 — Present",
    url: "github.com/y4nder/leettui",
    tagline:
      "Terminal UI for solving LeetCode problems end-to-end — browse, solve, run, and submit — without leaving the terminal.",
    bullets: [
      "Built using Bun and React (via OpenTUI)",
      "Local SQLite storage (Drizzle ORM) and a per-language offline test harness (Rust, C#, Java, Python, etc.) that runs example cases without hitting LeetCode's API",
      "Cross-platform (Linux/macOS/Windows) self-updating release binaries with a compressed-download install/update pipeline",
      "Git-integrated solution versioning — one-key local git UI plus GitHub backup/restore for syncing across machines",
    ],
    tech: ["Bun", "React", "TypeScript", "SQLite", "Drizzle ORM"],
  },
  {
    name: "ssh_portfolio",
    dates: "Jul 2026 — Present",
    url: "github.com/y4nder",
    tagline: "This thing you're looking at — a TUI portfolio served over SSH.",
    bullets: [
      "SSH server (ssh2) rendering a React app straight to your terminal via OpenTUI",
      "Anonymous auth, per-session React roots, resize handling, Docker deploy with CI",
    ],
    tech: ["OpenTUI", "React", "ssh2", "Bun"],
  },
  {
    name: "ygithub-stats-action",
    dates: "Feb 2026",
    url: "github.com/y4nder/ygithub-stats-action",
    tagline:
      "GitHub Action written in Rust that generates dynamic SVG cards (stats, top languages, contribution history) for profile READMEs, with 8 selectable themes.",
    bullets: ["Packaged as a Dockerized GitHub Action for drop-in reuse in any repo's CI workflow"],
    tech: ["Rust", "Docker", "GitHub Actions"],
  },
  {
    name: "YDotNet",
    dates: "Mar 2025 — Apr 2025",
    url: "github.com/y4nder/YDotNet",
    tagline: "Modular .NET utility library published to NuGet.",
    bullets: [
      "Result-pattern error handling, generic Repository/UnitOfWork implementations, and a NoSQL repository abstraction (e.g. MongoDB)",
      "Each component usable independently or together, reducing boilerplate in typical .NET data-access layers",
    ],
    tech: ["C#", ".NET", "NuGet"],
  },
  {
    name: "Simpletron Computer",
    dates: "Jan 2026",
    url: "github.com/y4nder/simpletron_computer_rust",
    tagline:
      "Rust reimplementation of a Simpletron virtual machine — CPU, memory model, and fetch-decode-execute cycle — extended with a full assembler pipeline.",
    bullets: [
      "Assembler supports mnemonics, labels, and variables",
      "Self-directed exercise in instruction encoding, memory modeling, and idiomatic Rust abstractions",
    ],
    tech: ["Rust"],
  },
  {
    name: "Faculytics 2.0",
    tagline:
      "Data mining platform for faculty feedback analysis, generating actionable insights and recommendations — award-winning research project.",
    bullets: [
      "1st place podium presentation, 1st place poster presentation, and Best Presenter at UC CCS Research Congress 2026",
    ],
    tech: ["NestJS", "PostgreSQL", "pgvector", "Redis", "Docker"],
  },
]

export type Honor = {
  title: string
  issuer: string
  date: string
  blurb?: string
}

export const honors: Honor[] = [
  {
    title: "UC CCS Research Congress 2026 — 1st Place, Podium Presentation",
    issuer: "University of Cebu College of Computer Studies",
    date: "May 2026",
    blurb:
      "Presented \"Faculytics 2.0: A Data Mining Approach for Feedback Analysis and the Generation of Actionable Insights and Recommendations\"; placed 1st in podium presentation.",
  },
  {
    title: "UC CCS Research Congress 2026 — Best Presenter",
    issuer: "University of Cebu College of Computer Studies",
    date: "May 2026",
    blurb: "Recognized as Best Presenter for \"Faculytics 2.0\".",
  },
  {
    title: "UC CCS Research Congress 2026 — 1st Place, Poster Presentation",
    issuer: "University of Cebu College of Computer Studies",
    date: "May 2026",
    blurb: "Placed 1st in poster presentation for \"Faculytics 2.0\".",
  },
  {
    title: "CCS Days Hackathon Champion (2026)",
    issuer: "University of Cebu College of Computer Studies",
    date: "Apr 2026",
    blurb: "Won 1st place in a hackathon held during CCS Days.",
  },
  {
    title: "12th UC Pre-ICT Congress Hackathon — 3rd Place",
    issuer: "University of Cebu College of Computer Studies",
    date: "Apr 2026",
    blurb: "Placed 3rd in a hackathon held during the University of Cebu Pre-ICT Congress.",
  },
  {
    title: "Hackestate 2025 Hackathon — 2nd Place",
    issuer: "Filipino Homes",
    date: "Apr 2025",
    blurb: "Placed 2nd in Hackestate 2025, a hackathon organized by Filipino Homes.",
  },
  {
    title: "CCS Days Hackathon Champion (2025)",
    issuer: "University of Cebu College of Computer Studies",
    date: "Mar 2025",
    blurb: "Won 1st place in a hackathon held during CCS Days.",
  },
  {
    title: "CCS Days Java Competition Champion",
    issuer: "University of Cebu College of Computer Studies",
    date: "Aug 2024",
    blurb: "Placed 1st in a Java programming competition held during CCS Days.",
  },
  {
    title: "10th UC Pre-ICT Congress — Java Competition Champion",
    issuer: "University of Cebu College of Computer Studies",
    date: "Apr 2024",
    blurb:
      "Placed 1st in a Java programming competition held during the University of Cebu Pre-ICT Congress.",
  },
]

export const contact = {
  email: "lorenzolubguban@gmail.com",
  github: "github.com/y4nder",
  linkedin: "linkedin.com/in/y4nder",
  ssh: "ssh lrnzo.space",
}

// What lands in the clipboard when a contact row is yanked — links paste
// ready-to-open, everything else copies as displayed.
export const contactCopy = {
  email: contact.email,
  github: `https://${contact.github}`,
  linkedin: `https://${contact.linkedin}`,
  ssh: contact.ssh,
}
