import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildDeckLuckResponse } from './route'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROUTE_SRC = readFileSync(join(__dirname, 'route.ts'), 'utf8')

describe('buildDeckLuckResponse', () => {
  it('returns aggregate luck panels, card histogram data, and duplicates without streak fields', () => {
    const response = buildDeckLuckResponse({
      setCode: 'LAW',
      scope: 'opened',
      poolType: 'sealed',
      rows: [{
        card_id: 'missing-card-id',
        card_name: 'Test Card',
        rarity: 'Common',
        aspects: ['Vigilance'],
        pack_index: 0,
        source_id: 'pool-1',
        source_type: 'sealed',
        treatment: 'base',
        is_showcase: false,
      }],
    })

    assert.equal(response.setCode, 'LAW')
    assert.equal(response.scope, 'opened')
    assert.equal(response.packsCracked, 1)
    assert.ok(Array.isArray(response.cardHits))
    assert.equal(response.duplicates.pools, 1)
    assert.equal(typeof response.duplicates.actualPerPool, 'number')
    assert.equal(Object.hasOwn(response, 'streaks'), false)
    assert.equal(Object.hasOwn(response, 'streaksHasMore'), false)
    assert.equal(Object.hasOwn(response, 'showcase'), false)
  })

  it('empty pools still return meaningful aggregate shape without streaks', () => {
    const response = buildDeckLuckResponse({ setCode: 'LAW', scope: 'kept', poolType: 'draft', rows: [] })
    assert.equal(response.packsCracked, 0)
    assert.equal(response.rarity.headlineRegime, 'insufficient')
    assert.equal(response.aspect.headlineRegime, 'insufficient')
    assert.deepEqual(response.cardHits, [])
    assert.equal(response.duplicates.pools, 0)
    assert.equal(Object.hasOwn(response, 'streaks'), false)
  })
})

describe('GET /api/stats/deck/[shareId]/luck route structure', () => {
  it('is shareId-open, rate limited, and documents streak privacy', () => {
    assert.match(ROUTE_SRC, /applyRateLimit\(request\)/)
    assert.doesNotMatch(ROUTE_SRC, /requireAuth\(request\)/)
    assert.match(ROUTE_SRC, /WHERE share_id = \$1/)
    assert.match(ROUTE_SRC, /PRIVACY/)
  })

  it('uses sealed opened cards by pool source_id and draft kept cards by pod/user', () => {
    assert.match(ROUTE_SRC, /cg\.source_type = 'sealed'[\s\S]*?cg\.source_id = \$1/)
    assert.match(ROUTE_SRC, /cg\.source_type = 'draft'[\s\S]*?cg\.source_id = \$1[\s\S]*?cg\.user_id = \$2/)
  })

  it('returns card histogram and duplicate widget data while omitting showcase, and sets public cache headers', () => {
    assert.match(ROUTE_SRC, /buildCardHits/)
    assert.match(ROUTE_SRC, /buildDuplicates/)
    assert.doesNotMatch(ROUTE_SRC, /buildShowcase/)
    assert.match(ROUTE_SRC, /Cache-Control', 'public, max-age=60'/)
  })
})
