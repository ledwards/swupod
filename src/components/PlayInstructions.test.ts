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
const POD_PAGE = readFileSync(join(__dirname, '../../app/draft/[shareId]/pod/page.tsx'), 'utf8')
const PLAY_PAGE = readFileSync(join(__dirname, '../../app/pool/[shareId]/deck/play/page.tsx'), 'utf8')

describe('<PlayInstructions /> Companion adoption', () => {
  it('pitches the Companion via the canonical PluginCTA component', () => {
    // The inline value-prop copy was consolidated into the single PluginCTA
    // component; PlayInstructions delegates the install pitch to it rather than
    // hand-rolling a block (see .claude/rules/ui-components.md).
    assert.ok(SRC.includes('PluginCTA'))
    assert.ok(SRC.includes('variant="autodetect"'))
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
    assert.ok(STORE_BUTTONS.includes('apps.apple.com/app/id6779564194'))
    // Android (Google Play) is still awaiting release.
    assert.match(STORE_BUTTONS, /name:\s*'Google Play'[^\n]*status:\s*'soon'/)
    assert.match(STORE_BUTTONS, /Get it on Google Play/)
  })

  it('tracks Companion install CTA clicks through limited play analytics', () => {
    assert.ok(ANALYTICS.includes("WAYFINDER_INSTALL_CTA: 'wayfinder_install_cta'"))
    assert.ok(SRC.includes('LimitedPlayActions.WAYFINDER_INSTALL_CTA'))
  })
})

// SPEC: `poolType` describes the POOL, not the UI variant. It is the single
// input that decides which open lobbies the deck owner is offered
// (PlayPageLobbies `format`), what the public Karabast lobby is named
// (buildLobbyName), and the Companion intent's format — so a draft pool must
// always be declared 'draft'. Solo (bot) drafts previously passed 'sealed' to
// borrow the standalone manual steps; that showed a draft-deck owner sealed
// lobbies, whose joins the server rejects on the format gate
// (joinOpenGameInTx, src/services/openGames.ts).
describe('<PlayInstructions /> pool type is the pool, not the UI variant', () => {
  it('FIXED: solo draft pods declare the pool as a draft, not sealed', () => {
    // The solo branch of the draft pod page. Its sibling non-solo branch has
    // always passed poolType="draft" for the same kind of pool.
    assert.ok(
      !/poolType="sealed"/.test(POD_PAGE),
      'draft pod page must never declare a sealed poolType — every pool it renders is a draft pool'
    )
    assert.equal(
      (POD_PAGE.match(/poolType="draft"/g) || []).length,
      2,
      'both the solo and non-solo PlayInstructions branches declare poolType="draft"'
    )
  })

  it('FIXED: the play page resolves poolType from the pool record for solo drafts too', () => {
    assert.ok(
      !/isSoloDraft \? 'sealed'/.test(PLAY_PAGE),
      'solo drafts must not be relabelled sealed — poolType comes from the pool record'
    )
    assert.match(PLAY_PAGE, /poolType=\{pool\?\.poolType \|\| 'sealed'\}/)
  })

  it('routes solo drafts to the standalone manual steps via isSoloDraft', () => {
    // The behaviour the old mislabelling was buying: a solo drafter has no
    // human podmates to message, so they get the "3 ways to play" steps.
    assert.match(
      SRC,
      /const inPod = \(poolType === 'draft' \|\| poolType === 'sealed_pod'\) && !isSoloDraft/
    )
  })

  it('derives the open-lobby format straight from poolType', () => {
    assert.match(SRC, /format=\{poolType === 'draft' \? 'draft' : 'sealed'\}/)
  })
})
