import { fonts } from "@opentui/core"

// Bespoke half-block banner font: 4 rows tall, stair-step diagonals with a
// slight forward lean. Only the glyphs the banner needs are defined; add more
// to `chars` as they become necessary. Registered into opentui's mutable
// `fonts` object at import time so `<ascii-font font="lrnzo">` resolves it.
const lrnzo = {
  name: "lrnzo",
  version: "1.0.0",
  homepage: "",
  colors: 1,
  lines: 4,
  buffer: ["", "", "", ""],
  letterspace: ["  ", "  ", "  ", "  "],
  letterspace_size: 2,
  chars: {
    L: [
      " ▄   ",
      " █   ",
      "▄▀   ",
      "█▄▄▄▄",
    ],
    R: [
      " ▄▄▄▄ ",
      " █   █",
      "▄▀▀▀█ ",
      "█   █ ",
    ],
    N: [
      " ▄▄  ▄",
      " █▀▄ █",
      "▄▀▄▀▄▀",
      "█  ██ ",
    ],
    Z: [
      " ▄▄▄▄▄",
      "   ▄▀ ",
      " ▄▀   ",
      "█▄▄▄▄ ",
    ],
    O: [
      "  ▄▄▄ ",
      " █   █",
      "▄▀  ▄▀",
      "▀▄▄▄▀ ",
    ],
    " ": [
      "   ",
      "   ",
      "   ",
      "   ",
    ],
  },
}

;(fonts as Record<string, unknown>).lrnzo = lrnzo

export const LRNZO_FONT = "lrnzo"
