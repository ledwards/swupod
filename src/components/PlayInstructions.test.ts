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

  it('enables Chrome and Safari (live) and leaves Firefox awaiting approval', () => {
    assert.ok(SRC.includes('WayfinderStoreButtons'))
    assert.ok(STORE_BUTTONS.includes('https://chromewebstore.google.com/detail/wayfinder-companion/econclbajpendbppldcnpngjfddcogfh'))
    // Chrome is a live, installable browser card.
    assert.match(STORE_BUTTONS, /status:\s*'live'/)
    assert.match(STORE_BUTTONS, /Add to Chrome/)
    // Safari is now live on desktop: it has a live status, an App Store URL,
    // and the "Add to Safari" CTA.
    assert.match(STORE_BUTTONS, /Add to Safari/)
    assert.ok(STORE_BUTTONS.includes('WAYFINDER_SAFARI_APP_STORE_URL'))
    assert.ok(STORE_BUTTONS.includes('apps.apple.com'))
    assert.match(STORE_BUTTONS, /browser:\s*'safari',\s*name:\s*'Safari'[^\n]*status:\s*'live'/)
    // Firefox is present but awaiting store approval (status 'soon').
    assert.match(STORE_BUTTONS, /Firefox/)
    assert.match(STORE_BUTTONS, /status:\s*'soon'/)
    assert.match(STORE_BUTTONS, /Coming soon/i)
  })

  it('offers iOS live on the App Store and Android coming soon on mobile', () => {
    // Mobile swaps the browser cards for the phone app stores.
    // iOS is live on the App Store (links to the published listing).
    assert.match(STORE_BUTTONS, /name:\s*'App Store'[^\n]*status:\s*'live'/)
    assert.match(STORE_BUTTONS, /Download on the App Store/)
    assert.ok(STORE_BUTTONS.includes('apps.apple.com/us/app/wayfinder-companion/id6779564194'))
    // Android (Google Play) is still awaiting release.
    assert.match(STORE_BUTTONS, /name:\s*'Google Play'[^\n]*status:\s*'soon'/)
    assert.match(STORE_BUTTONS, /Get it on Google Play/)
  })

  it('tracks Companion install CTA clicks through limited play analytics', () => {
    assert.ok(ANALYTICS.includes("WAYFINDER_INSTALL_CTA: 'wayfinder_install_cta'"))
    assert.ok(SRC.includes('LimitedPlayActions.WAYFINDER_INSTALL_CTA'))
  })
})
