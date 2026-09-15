import assert from "node:assert/strict"
import test from "node:test"

import { findUnlayeredRules } from "./check-css-layers.mjs"

test("rejects every unlayered ordinary rule", () => {
  const source = `
    blockquote { color: red; }
    dl { margin: 0; }
    #app { min-height: 100%; }
    :root { --brand: red; }
    .button { color: white; }
  `

  assert.deepEqual(
    findUnlayeredRules(source).map(({ selector }) => selector),
    ["blockquote", "dl", "#app", ":root", ".button"],
  )
})

test("accepts rules inside cascade layers and keyframes", () => {
  const source = `
    @layer base { :root { --brand: red; } }
    @layer components {
      .button { color: white; }
      @media (min-width: 40rem) { .button { padding: 1rem; } }
    }
    @keyframes rise { from { opacity: 0; } to { opacity: 1; } }
  `

  assert.deepEqual(findUnlayeredRules(source), [])
})
