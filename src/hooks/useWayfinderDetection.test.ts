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
    assert.match(SRC, /return \{ detected, iconUrl, settled \}/)
  })
})
