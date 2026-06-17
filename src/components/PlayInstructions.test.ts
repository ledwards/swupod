import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const SRC = readFileSync(join(__dirname, 'PlayInstructions.tsx'), 'utf8')
const CSS = readFileSync(join(__dirname, 'PlayInstructions.css'), 'utf8')
const STORE_BUTTONS = readFileSync(join(__dirname, 'WayfinderStoreButtons.tsx'), 'utf8')
const ANALYTICS = readFileSync(join(__dirname, '../analytics/limitedEvents.ts'), 'utf8')

describe('<PlayInstructions /> Companion adoption', () => {
  it('enumerates the PTP Companion value props from the adoption brief', () => {
    assert.ok(SRC.includes('Automagically join the Karabast queue'))
    assert.ok(SRC.includes('Collect play data for your pool'))
    assert.ok(SRC.includes('Record, share, and rewatch your replays'))
    assert.ok(SRC.includes('Take notes, enrich your games with metadata'))
  })

  it('shows the Companion install panel to users without the extension', () => {
    assert.ok(SRC.includes('renderCompanionInstallPanel()'))
    assert.match(CSS, /\.wayfinder-promo-panel\s*\{/)
  })

  it('keeps installed-owner Wayfinder lobby actions in place', () => {
    assert.ok(SRC.includes("type: 'wayfinder:create-lobby'"))
    assert.ok(SRC.includes("type: 'wayfinder:join-lobby'"))
    assert.ok(SRC.includes('wayfinderDetected && isOwner'))
  })

  it('enables Chrome and leaves Safari/Firefox awaiting approval', () => {
    assert.ok(SRC.includes('WayfinderStoreButtons'))
    assert.ok(STORE_BUTTONS.includes('https://chromewebstore.google.com/detail/wayfinder-companion/econclbajpendbppldcnpngjfddcogfh'))
    // Chrome is the live, installable browser card.
    assert.match(STORE_BUTTONS, /status:\s*'live'/)
    assert.match(STORE_BUTTONS, /Add to Chrome/)
    // Safari and Firefox are present but awaiting store approval (status 'soon').
    assert.match(STORE_BUTTONS, /Safari/)
    assert.match(STORE_BUTTONS, /Firefox/)
    assert.match(STORE_BUTTONS, /status:\s*'soon'/)
    assert.match(STORE_BUTTONS, /Coming soon/i)
  })

  it('tracks Companion install CTA clicks through limited play analytics', () => {
    assert.ok(ANALYTICS.includes("WAYFINDER_INSTALL_CTA: 'wayfinder_install_cta'"))
    assert.ok(SRC.includes('LimitedPlayActions.WAYFINDER_INSTALL_CTA'))
  })
})
