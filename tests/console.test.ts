// Unit tests for the hidden console's pure executor. The real-data commands
// (visitors/guestbook) hit the module-level store, so point it at a scratch
// in-memory database BEFORE anything triggers the lazy getStore().
process.env.DB_PATH = ":memory:"

import { describe, expect, test } from "bun:test"
import {
  bootLines,
  consoleRows,
  CONSOLE_CHROME,
  execute,
  promptFor,
  type ConsoleCtx,
} from "../src/app/console"
import { QR_HEIGHT } from "../src/app/qr"

const ctx = (over: Partial<ConsoleCtx> = {}): ConsoleCtx => ({
  ip: "203.0.113.7",
  visitorNumber: 42,
  online: 3,
  cwd: "~",
  history: [],
  theme: "signal",
  ...over,
})

const texts = (r: ReturnType<typeof execute>) => r.lines.map((l) => l.text).join("\n")

describe("execute", () => {
  test("unknown command errors and points at help", () => {
    const r = execute("frobnicate", ctx())
    expect(texts(r)).toContain("command not found: frobnicate")
    expect(texts(r)).toContain("try 'help'")
    expect(r.lines[0]!.style).toBe("error")
  })

  test("help lists common commands but not the hidden ones", () => {
    const out = texts(execute("help", ctx()))
    for (const name of ["whoami", "visitors", "guestbook", "ls", "cat", "exit"])
      expect(out).toContain(name)
    expect(out).not.toContain("sudo")
    expect(out).not.toContain("history")
    expect(out).toContain("some commands are not listed")
  })

  test("whoami reports ip and visitor number", () => {
    const out = texts(execute("whoami", ctx()))
    expect(out).toContain("guest")
    expect(out).toContain("203.0.113.7")
    expect(out).toContain("visitor #0042")
  })

  test("online singular/plural phrasing", () => {
    expect(texts(execute("online", ctx({ online: 1 })))).toContain("just you")
    expect(texts(execute("online", ctx({ online: 4 })))).toContain("4 sessions")
  })

  test("visitors and guestbook read the (scratch) store without throwing", () => {
    expect(texts(execute("visitors", ctx()))).toContain("total visits")
    expect(texts(execute("guestbook", ctx()))).toContain("no entries yet")
  })

  test("portfolio queries surface content.ts data", () => {
    expect(texts(execute("projects", ctx()))).toContain("leettui")
    expect(texts(execute("exp", ctx()))).toContain("Full Scale")
    expect(texts(execute("experience", ctx()))).toContain("Full Scale") // alias
    expect(texts(execute("skills", ctx()))).toContain("TypeScript")
    expect(texts(execute("contact", ctx()))).toContain("lorenzolubguban@gmail.com")
    expect(texts(execute("about", ctx()))).toContain("Leander")
  })

  test("qr prints the accent module grid with a scan caption", () => {
    const r = execute("qr", ctx())
    expect(r.lines.length).toBe(QR_HEIGHT + 1)
    expect(r.lines[1]!.text).toContain("█▀▀▀▀▀█") // finder pattern row
    expect(r.lines[1]!.style).toBe("accent")
    // every module row fits the min console width — wrapText must pass
    // them through untouched or the grid shreds
    for (const l of r.lines.slice(0, -1)) expect(l.text.length).toBeLessThanOrEqual(29)
    expect(r.lines.at(-1)!.text).toContain("linkedin.com/in/y4nder")
    expect(r.lines.at(-1)!.style).toBe("dim")
  })

  test("echo repeats its arguments", () => {
    expect(texts(execute("echo hello there `", ctx()))).toBe("hello there `")
  })

  test("uptime reports the process age format", () => {
    expect(texts(execute("uptime", ctx()))).toMatch(/up .*· 1 shell/)
  })
})

describe("fake filesystem", () => {
  test("ls hides dotfiles; ls -a reveals .secrets", () => {
    const plain = texts(execute("ls", ctx()))
    expect(plain).toContain("about.txt")
    expect(plain).toContain("projects/")
    expect(plain).not.toContain(".secrets")
    const all = texts(execute("ls -a", ctx()))
    expect(all).toContain(".secrets")
  })

  test("cat .secrets pays off", () => {
    const out = texts(execute("cat .secrets", ctx()))
    expect(out).toContain("you earned this")
    expect(out).toContain("this is the bottom")
  })

  test("cat with no arg, missing file, and directory", () => {
    expect(texts(execute("cat", ctx()))).toContain("usage: cat")
    expect(texts(execute("cat nope.txt", ctx()))).toContain("no such file")
    expect(texts(execute("cat projects", ctx()))).toContain("is a directory")
  })

  test("cd into projects, cat a project by slug, cd .. back", () => {
    const r = execute("cd projects", ctx())
    expect(r.cwd).toBe("~/projects")
    expect(texts(execute("cat leettui", ctx({ cwd: "~/projects" })))).toContain("LeetCode")
    expect(texts(execute("ls", ctx({ cwd: "~/projects" })))).toContain("leettui")
    expect(execute("cd ..", ctx({ cwd: "~/projects" })).cwd).toBe("~")
    expect(execute("cd", ctx({ cwd: "~/projects" })).cwd).toBe("~")
  })

  test("cd refuses / and unknown dirs", () => {
    expect(texts(execute("cd /", ctx()))).toContain("permission denied")
    expect(texts(execute("cd narnia", ctx()))).toContain("no such directory")
    expect(texts(execute("cd about.txt", ctx()))).toContain("not a directory")
  })

  test("pwd maps ~ to /home/guest", () => {
    expect(texts(execute("pwd", ctx()))).toBe("/home/guest")
    expect(texts(execute("pwd", ctx({ cwd: "~/projects" })))).toBe("/home/guest/projects")
  })
})

describe("jokes", () => {
  test("sudo reports the incident", () => {
    const out = texts(execute("sudo make me a sandwich", ctx()))
    expect(out).toContain("not in the sudoers file")
    expect(out).toContain("incident will be reported")
  })

  test("rm -rf / is a bit, in either flag order, with or without sudo", () => {
    for (const input of ["rm -rf /", "rm -fr /", "sudo rm -rf /"])
      expect(texts(execute(input, ctx()))).toContain("just kidding")
  })

  test("plain rm hits the read-only filesystem", () => {
    expect(texts(execute("rm todo.md", ctx()))).toContain("read-only filesystem")
  })
})

describe("effects", () => {
  test("clear returns the clear effect with no output", () => {
    const r = execute("clear", ctx())
    expect(r.effect).toBe("clear")
    expect(r.lines).toHaveLength(0)
  })

  test("exit (and logout) return the exit effect after a logout line", () => {
    for (const input of ["exit", "logout"]) {
      const r = execute(input, ctx())
      expect(r.effect).toBe("exit")
      expect(texts(r)).toBe("logout")
    }
  })

  test("theme with no args reports current and available", () => {
    const out = texts(execute("theme", ctx()))
    expect(out).toContain("current: signal")
    expect(out).toContain("available: signal, circuit")
    expect(out).toContain("usage: theme <name>")
  })

  test("theme <name> returns the switch for App to apply", () => {
    const r = execute("theme circuit", ctx())
    expect(r.theme).toBe("circuit")
    expect(texts(r)).toContain("theme → circuit")
    expect(r.lines[0]!.style).toBe("accent")
  })

  test("theme rejects unknown names and no-ops on the current one", () => {
    const bad = execute("theme neon", ctx())
    expect(bad.theme).toBeUndefined()
    expect(texts(bad)).toContain("no such theme: neon")
    const same = execute("theme signal", ctx())
    expect(same.theme).toBeUndefined()
    expect(texts(same)).toContain("already on signal")
  })

  test("history dumps ctx history numbered", () => {
    const out = texts(execute("history", ctx({ history: ["ls", "cat .secrets"] })))
    expect(out).toContain("1  ls")
    expect(out).toContain("2  cat .secrets")
  })
})

describe("plumbing", () => {
  test("prompt embeds the banner identity and cwd", () => {
    expect(promptFor("~")).toBe("guest@lrnzo:~$")
  })

  test("boot banner mentions the guest shell", () => {
    expect(bootLines().map((l) => l.text).join("\n")).toContain("guest shell")
  })

  test("consoleRows never collapses below one row", () => {
    expect(consoleRows(CONSOLE_CHROME - 2)).toBe(1)
    expect(consoleRows(32)).toBe(32 - CONSOLE_CHROME)
  })
})
