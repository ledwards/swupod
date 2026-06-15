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

  it('still honors valid hash links for set tabs', () => {
    assert.ok(SRC.includes('window.location.hash.slice(1)'))
    assert.match(SRC, /if\s*\(\s*hash\s*&&\s*tabs\.includes\(hash\)\s*\)\s*setActiveTab\(hash\)/)
  })
})
