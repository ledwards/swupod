import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const SRC = readFileSync(join(__dirname, 'page.tsx'), 'utf8')

describe('/me personal stats page', () => {
  it('mounts the personal YourStats experience', () => {
    assert.match(SRC, /import\s+YourStats\s+from\s+['"]@\/src\/components\/YourStats['"]/)
    assert.match(SRC, /<YourStats\s+since=\{startDate\}\s+until=\{endDate\}/)
  })

  it('uses the personal stats page title and date range controls', () => {
    assert.ok(SRC.includes('My Stats'))
    assert.ok(SRC.includes('Gameplay and pull data'))
    assert.ok(SRC.includes('stats-date-range'))
    // "All" range spans the set's whole history up to today (not the era window).
    assert.ok(SRC.includes('ALL_TIME_START'))
    assert.ok(SRC.includes('todayStr()'))
  })

  it('keeps the personal data export on the personal page', () => {
    assert.ok(SRC.includes('/api/export/personal'))
    assert.ok(SRC.includes('Download Personal Data'))
  })

  it('defaults the Set filter to the newest set the viewer can open (pre-release only with access)', () => {
    // Early access = beta tester or admin (same gate as /stats + EarlyAccessCTA).
    assert.match(SRC, /is_beta_tester\s*\|\|\s*user\?\.is_admin/)
    // The default comes from the shared beta-aware helper, NOT an unconditional
    // eras[0] (which would hand ASH to viewers without early access).
    assert.match(SRC, /getDefaultStatsSetTab\(hasEarlyAccess\)/)
    assert.doesNotMatch(SRC, /getEras\(\)\[0\]\?\.setCode/)
  })

  it('re-syncs the default once auth resolves without clobbering a manual pick', () => {
    // useAuth resolves after mount; an effect upgrades the default to ASH for
    // early-access viewers, guarded by a ref set when the viewer picks a set.
    assert.match(SRC, /userPickedSet\.current\s*=\s*true/)
    assert.match(SRC, /if\s*\(\s*userPickedSet\.current\s*\)\s*return/)
  })
})
