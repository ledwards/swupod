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

  it('defaults the Set filter to the newest set for every viewer (not hardcoded, not gated)', () => {
    // The /me page opens on the NEWEST set for everyone: getDefaultStatsSetTab(true)
    // takes STATS_SET_ORDER[0] (the pre-release set included) and auto-advances as
    // sets ship. No beta/admin gate, no re-sync effect, no hardcoded set code.
    assert.match(SRC, /useState<string>\(\(\)\s*=>\s*getDefaultStatsSetTab\(true\)\)/)
    assert.doesNotMatch(SRC, /hasEarlyAccess/)
    assert.doesNotMatch(SRC, /userPickedSet/)
    // Not frozen on a literal set code (e.g. 'ASH'/"ASH") anywhere in the page.
    assert.doesNotMatch(SRC, /['"]ASH['"]/)
  })
})
