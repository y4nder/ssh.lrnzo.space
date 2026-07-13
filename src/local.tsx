// Dev-only entry: renders the app in *this* terminal — no SSH server needed.
// Run: bun run local   (watch mode re-renders on save)
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./app/App"

const renderer = await createCliRenderer({ exitOnCtrlC: false })
const root = createRoot(renderer)

const exit = () => {
  root.unmount()
  renderer.destroy()
  process.exit(0)
}

root.render(<App onExit={exit} />)
