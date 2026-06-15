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
    assert.ok(SRC.includes('DEFAULT_START_DATE'))
  })

  it('keeps the personal data export on the personal page', () => {
    assert.ok(SRC.includes('/api/export/personal'))
    assert.ok(SRC.includes('Download Personal Data'))
  })
})
