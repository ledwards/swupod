import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const SOURCE = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')

describe('/draft page creation routes', () => {
  it('routes Standard Draft creation to the explicit non-competitive draft URL', () => {
    assert.match(SOURCE, /router\.push\(STANDARD_DRAFT_NEW_PATH\)/)
  })

  it('routes Competitive Draft creation to the explicit competitive draft URL', () => {
    assert.match(SOURCE, /router\.push\(COMPETITIVE_DRAFT_NEW_PATH\)/)
  })

  it('returns unauthenticated create-draft users to the standard draft URL after login', () => {
    assert.match(SOURCE, /encodeURIComponent\(STANDARD_DRAFT_NEW_PATH\)/)
  })
})
