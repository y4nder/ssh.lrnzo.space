# ssh_portfolio

A terminal-UI portfolio served over SSH — the app *is* the SSH server.

```
ssh lrnzo.space
```

![Demo of the SSH portfolio TUI](assets/demo.gif)

*(Recorded with [vhs](https://github.com/charmbracelet/vhs) — regenerate from the repo root with `vhs scripts/demo.tape`.)*

**Dark terminals only (for now).** The background defers to the visitor's
terminal, but the text tokens assume a dark one — on a light terminal the
body text is near-invisible. If this ever matters enough:
`renderer.getPalette()` can OSC-query the client terminal's background over
the SSH channel; branch the theme tokens on its luminance (fall back to dark
when the terminal doesn't answer). See `src/app/theme.ts`.

## Architecture

```
visitor ──ssh──> :22 (container listens on 2222 internally)
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

### Now playing

A live Spotify readout — a ticker above the status bar, and a full page on `m`
laid out as a Spotify-Code card: cover art rendered as a themed halftone, its
signature wave strip fused to the bottom edge, track centred beneath. `c` flips
the cover for a QR you can scan to open the song on your phone. Data comes from
`GET /now-playing` on [api.lrnzo.space](https://api.lrnzo.space/now-playing),
which also feeds the website's banner.

The wave strip is a **deterministic signature of the track**, not a spectrum
analyser — Spotify deprecated the audio-analysis endpoint for new apps, so
there is no real spectrum to draw and pretending otherwise would be a lie about
data we do not have. The shape never moves; progress is carried by colour,
played bars in the accent and the rest dim.

This is the app's **only outbound HTTP call**, and its shape is dictated by the
deployment: one process serves every session from one VPS IP, and the endpoint
rate-limits at 30 req/min per IP. So the poller is a module singleton
(`src/nowplaying.ts`, same pattern as `src/presence.ts`) — **3 req/min total no
matter how many people are connected, and nothing at all while nobody is**. The
website polls per visitor and cannot do that.

- `src/nowplaying.ts` — the shared store and poll loop
- `src/albumArt.ts` — cover fetch → JPEG decode → luminance grid (once per track)
- `src/app/music.ts` — pure builders: halftone ramp, marquee, ticker budget, layout

Every failure resolves to *render nothing*: the ticker collapses, `m` goes
inert, and the frame reflows as if the feature did not exist.

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
bun run local        # UI iteration: renders in *this* terminal, live-reloads on save
```

For session-level behavior (auth, resize, disconnects) run the real server:

```bash
ssh-keygen -t ed25519 -f keys/host_key -N ""   # once
bun run dev                                     # then: ssh -p 2222 localhost
bun run typecheck
```

### Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` / `BIND` | `2222` / `0.0.0.0` | listener |
| `HOST_KEY_PATH` | `keys/host_key` | must be uid 1000 in the container |
| `MAX_SESSIONS` | `30` | concurrent SSH sessions |
| `IDLE_TIMEOUT_MS` | — | disconnect idle sessions |
| `DB_PATH` | `data/portfolio.db` | visitor counter + guestbook |
| `GUESTBOOK_RATE_MIN` | `10` | minutes between entries per IP |
| `NOWPLAYING_URL` | `https://api.lrnzo.space/now-playing` | **set to `""` to disable the readout** |
| `NOWPLAYING_FIXTURE` | — | a `/now-playing` payload as JSON: publishes once, never polls |
| `BLOG_URL` | `https://api.lrnzo.space/posts` | **set to `""` to disable the log** |
| `BLOG_FIXTURE` | — | an array of posts *with bodies*: seeds the index and the reader, never fetches |

Both fixtures are how the two API-backed pages get exercised offline — the tests
and `scripts/frame-dump.ts` use them, and they make the frame deterministic:

```bash
NOWPLAYING_FIXTURE='{"isPlaying":true,"track":{"title":"Kalopsia","artist":"Novo Amor",
  "album":"Interlucent","albumArt":null,"url":"https://open.spotify.com/track/x",
  "durationMs":240000},"progressMs":60000,"playedAt":null,"ageMs":0}' \
  bun scripts/frame-dump.ts m

BLOG_FIXTURE='[{"slug":"a-post","no":"001","title":"A post","dek":"A summary.",
  "publishedAt":"2026-01-02T00:00:00.000Z","kind":"NOTE","tags":["x"],"readingMinutes":2,
  "media":{"alt":"Cover art."},"body":"## Heading\n\nSome *prose*."}]' \
  bun scripts/frame-dump.ts l
```

`bun test` sets `NODE_ENV=test`, which disables both outright — the suite never
touches the network, including the server the smoke test spawns.

The log is **read-only**: the app issues `GET /posts` and `GET /posts/:slug` and
nothing else. It fetches on demand rather than polling, and caches the index for
five minutes — every visitor shares this box's single egress IP against the
API's 100 req/min limit.

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

The portfolio is docker-published on **port 22** (`ssh lrnzo.space`); admin
access is a separate hardened sshd on another port. Deploy target host/port/user
are stored as GitHub Actions secrets, not in this tree.
