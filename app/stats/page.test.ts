import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const SRC = readFileSync(join(__dirname, 'page.tsx'), 'utf8')

describe('/stats tab defaults', () => {
  it('uses the shared stats tab registry with beta access', () => {
    assert.match(SRC, /getStatsSetTabs\(hasBetaSetAccess\)/)
    assert.match(SRC, /user\?\.is_beta_tester\s*\|\|\s*user\?\.is_admin/)
  })

  it('uses the shared set color map for tab styling', () => {
    assert.match(SRC, /STATS_SET_COLORS\[tab\]/)
  })

  it('defaults the stats page to the default set tab', () => {
    assert.match(SRC, /useState\(\s*DEFAULT_STATS_SET_TAB\s*\)/)
  })

  it('does not mount personal stats on /stats', () => {
    assert.doesNotMatch(SRC, /YourStats/)
    assert.doesNotMatch(SRC, /Play Data/)
  })

  it('renders card tiers through the shared CardDataTierList component', () => {
    assert.match(SRC, /import\s+CardDataTierList\s+from\s+['"]@\/src\/components\/CardDataTierList['"]/)
    assert.match(SRC, /<CardDataTierList[\s\S]*?allowTable[\s\S]*?viewParamName=\{CARD_DATA_VIEW_PARAM\}/)
    assert.doesNotMatch(SRC, /function\s+CardDataTab/)
  })

  it('still honors valid hash links for set tabs', () => {
    assert.ok(SRC.includes('window.location.hash.slice(1)'))
    assert.match(SRC, /if\s*\(\s*hash\s*&&\s*tabs\.includes\(hash\)\s*\)\s*setActiveTab\(hash\)/)
  })
})

describe('/stats set consistency across tabs', () => {
  // Regression: on the ASH tab, the All Players / Competitive Players panels showed
  // LAW data. The tab resolves LAW->ASH as auth loads, and the unguarded fetch effects
  // let slow LAW responses clobber fresh ASH data. Both Sealed and Draft fetch effects
  // must drop stale responses when setCode (or auth-derived params) change.
  const cancelGuards = SRC.match(/return \(\) => \{ cancelled = true \}/g) || []
  const cancelFlags = SRC.match(/let cancelled = false/g) || []

  it('guards every data-fetch effect with a stale-response cancel flag', () => {
    // One per tab component (SealedTab + DraftTab).
    assert.ok(cancelFlags.length >= 2, `expected >= 2 cancel flags, found ${cancelFlags.length}`)
    assert.ok(cancelGuards.length >= 2, `expected >= 2 cleanup cancels, found ${cancelGuards.length}`)
  })

  it('only applies fetch results when the effect is still current', () => {
    // setState from a resolved fetch must be gated on !cancelled so a prior set's
    // response cannot overwrite the active set's panels.
    assert.match(SRC, /if\s*\(\s*!cancelled\s*\)/)
    assert.doesNotMatch(SRC, /\.then\(result => setCardData\(result\.data \|\| result\)\)/)
  })
})
