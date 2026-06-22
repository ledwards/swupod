// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = readFileSync(join(__dirname, 'useWayfinderDetection.ts'), 'utf8')

// The extension announces itself identically on Chrome/Firefox/Safari with a
// meta tag + a CustomEvent + postMessages, but only on the pages its content
// script injects into. The hook must read ALL those live signals AND bridge via
// localStorage so /me (where the extension doesn't inject) still knows.
describe('useWayfinderDetection contract', () => {
  it('reads the injected meta marker', () => {
    assert.match(SRC, /meta\[name="wayfinder-installed"\]/)
  })

  it('listens for the wayfinder:installed event', () => {
    assert.match(SRC, /addEventListener\(\s*['"]wayfinder:installed['"]/)
  })

  it('treats the postMessage signals as detection too', () => {
    assert.match(SRC, /wayfinder:metadata/)
    assert.match(SRC, /wayfinder:lobby-count/)
    assert.match(SRC, /addEventListener\(\s*['"]message['"]/)
  })

  it('bridges via localStorage so non-injected pages (/me) can detect', () => {
    assert.match(SRC, /localStorage\.setItem/)
    assert.match(SRC, /localStorage\.getItem/)
  })

  it('honors the ?wayfinder=1/0 QA override', () => {
    assert.match(SRC, /['"]wayfinder['"]/)
    assert.match(SRC, /forced === '1'/)
    assert.match(SRC, /forced === '0'/)
  })

  it('returns a settled flag so install nudges do not flash before detection resolves', () => {
    assert.match(SRC, /settled:\s*boolean/)
    assert.match(SRC, /setSettled\(true\)/)
    assert.match(SRC, /return \{ detected, iconUrl, settled, pluginLoggedIn, capabilities \}/)
  })

  // Capability gating: the marker / metadata postMessage carry a capability list
  // so the play page can tell an old Companion (manual) from a capable one (live).
  it('parses advertised capabilities from the marker and the metadata postMessage', () => {
    assert.match(SRC, /capabilities:\s*string\[\]/)
    assert.match(SRC, /dataset\.capabilities/)
    assert.match(SRC, /parseCapabilities/)
  })

  it('honors the ?wfcap=ready|old|none QA override', () => {
    assert.match(SRC, /['"]wfcap['"]/)
    assert.match(SRC, /forcedCap === 'ready'/)
    assert.match(SRC, /forcedCap === 'old'/)
    assert.match(SRC, /forcedCap === 'none'/)
  })

  // Sign-in state: the marker carries data-logged-in and the extension
  // postMessages wayfinder:auth-state. These tell "installed but signed out"
  // apart from "installed and ready" so callers can nudge toolbar sign-in.
  it('reads the marker sign-in attribute and the auth-state postMessage', () => {
    assert.match(SRC, /dataset\.loggedIn/)
    assert.match(SRC, /wayfinder:auth-state/)
  })

  it('exposes pluginLoggedIn as a tri-state (null = unknown, do not nag)', () => {
    assert.match(SRC, /pluginLoggedIn:\s*boolean\s*\|\s*null/)
    assert.match(SRC, /useState<boolean \| null>\(null\)/)
  })

  it('honors the ?wflogin=1/0 QA override for sign-in state', () => {
    assert.match(SRC, /['"]wflogin['"]/)
    assert.match(SRC, /forcedLogin === '1'/)
    assert.match(SRC, /forcedLogin === '0'/)
  })
})
