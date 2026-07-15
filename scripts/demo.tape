# Demo GIF for the README — regenerate from the repo root with:
#   vhs scripts/demo.tape          (or: bun run demo)
# A crisper 1920x1080 MP4 (gitignored) derives from this same tape:
#   bun run demo:mp4
# Records the dev entry (src/local.tsx), which renders the same app the
# SSH server serves. A throwaway DB keeps the real guestbook/visit data clean.

Output assets/demo.gif

Set FontSize 15
Set Width 1280
Set Height 780
Set Padding 12
Set TypingSpeed 100ms

# type the real invocation on camera...
Type "ssh lrnzo.space"
Sleep 900ms

# ...but run the local entry off camera (no prod visit/presence pollution)
Hide
Ctrl+U
Type "DB_PATH=/tmp/vhs-demo.db bun src/local.tsx"
Enter
Sleep 1.5s
Show

# banner flicker + about typewriter entrance
Sleep 6s

# walk a couple of sections
Type "e"
Sleep 2.5s
Type "p"
Sleep 2.5s

# open the first project's detail, scroll, back out
Enter
Sleep 3.5s
Type "j"
Sleep 600ms
Type "j"
Sleep 600ms
Type "j"
Sleep 1.5s
Escape
Sleep 1s

# theme cycle — glitch burst into each theme
Type "t"
Sleep 3s
Type "t"
Sleep 3s

# CV takeover, scroll-stream typewriter
Type "r"
Sleep 3s
Type "j"
Sleep 500ms
Type "j"
Sleep 500ms
Type "j"
Sleep 500ms
Type "j"
Sleep 500ms
Type "j"
Sleep 1.5s
Escape
Sleep 1s

# guestbook
Type "b"
Sleep 3.5s
Escape
Sleep 1s

# end on contact — QR flash-in + typewriter
Type "c"
Sleep 5s

Hide
Type "q"
