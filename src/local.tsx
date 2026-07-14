// Dev-only entry: renders the app in *this* terminal — no SSH server needed.
// Run: bun run local   (watch mode re-renders on save)
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./app/App"
import { getStore } from "./db"
import { join } from "./presence"

// dev exercises the real DB path (./data/portfolio.db unless DB_PATH is set)
const visitorNumber = getStore().recordVisit("local")

const renderer = await createCliRenderer({ exitOnCtrlC: false })
const root = createRoot(renderer)

const exit = () => {
  root.unmount()
  renderer.destroy()
  process.exit(0)
}

join() // the dev terminal counts as one connected session
root.render(<App onExit={exit} ip="local" visitorNumber={visitorNumber} />)
