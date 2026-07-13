# ssh_portfolio

A terminal-UI portfolio served over SSH — the app *is* the SSH server.

```
ssh <domain>        # once port 22 cutover is done
ssh -p 2222 <vps>   # today
```

## Architecture

```
visitor ──ssh──> :2222
                  │
        Bun process (Docker, non-root, 512MB cap)
                  │
        ssh2 Server — host key, anonymous auth, no shell/exec/forwarding
                  │  per connection: session → pty-req → window-change
                  ▼
        TTY-shaped channel wrapper → OpenTUI CliRenderer → React app
```

One long-running process; one OpenTUI renderer + React root per SSH session.
A session can only render the TUI — `exec`, `sftp`, subsystems, and all
forwarding are rejected.

- `src/server.ts` — ssh2 server: auth, session wiring, limits, cleanup
- `src/session.ts` — per-connection renderer/React lifecycle
- `src/tty-stream.ts` — grafts a TTY surface onto the ssh2 channel
- `src/app/` — the React UI; **all copy lives in `src/app/content.ts`**

## Runtime decision (Phase 0 spike, 2026-07-13)

**Bun 1.3.14.** OpenTUI's native renderer is Bun-first (Node needs 26.4+ with
`--experimental-ffi`), and ssh2 1.17.0 — despite historical Bun issues —
passed the full spike: handshake, anonymous auth, PTY, `window-change`
resize, and clean teardown.

Hard-won details baked into the code:

- Every renderer must be created with `consoleMode: "disabled"`, or it
  hijacks the global `console` for its overlay and server logs vanish.
- OpenTUI only wires SIGWINCH for `process.stdout`; remote sessions must call
  `renderer.resize()` from the ssh2 `window-change` event.
- Call `channel.exit(0)` before `channel.end()` or `ssh` exits 255.
- Abrupt disconnects can skip the channel `close` event — connection-level
  cleanup is the fallback that keeps the session counter and renderers honest.

## Develop

```bash
bun install
ssh-keygen -t ed25519 -f keys/host_key -N ""   # once
bun run dev                                     # then: ssh -p 2222 localhost
bun run typecheck
```

## Deploy

Runs on the VPS at `/opt/ssh-portfolio`, alongside the other Docker services.

```bash
rsync -az --exclude node_modules --exclude keys --exclude .env \
  ./ root@<vps>:/opt/ssh-portfolio/
ssh root@<vps> 'cd /opt/ssh-portfolio && docker compose up -d --build'
```

The production host key lives only on the VPS (`keys/`, gitignored) and is
volume-mounted read-only; it must be owned by uid 1000 (the container's
non-root `bun` user). Regenerating it would show visitors a scary
host-key-changed warning — don't.

## Port 22 cutover (pending)

Staged, zero-break-window plan: admin sshd adds port 2200 alongside 22 →
local `~/.ssh/config` and the faculytics CI port secret move to 2200 → test
deploy confirms green → sshd drops 22 → this container publishes 22.
Details in the project plan.
