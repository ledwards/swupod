// Tests for GET /api/cards (U5, foundations hardening) — the server-side
// source of card data for client consumers. Invoked directly; reads the
// corrected dataset via src/utils/cardData (no DB needed).
import { describe, it } from 'node:test'
import assert from 'node:assert'

const { NextRequest } = await import('next/server')
const { GET } = await import('./route')

function request(query: string): InstanceType<typeof NextRequest> {
  return new NextRequest(`http://localhost:3000/api/cards${query}`)
}

describe('GET /api/cards', () => {
  it('returns 400 without a set parameter', async () => {
    const response = await GET(request(''))
    assert.strictEqual(response.status, 400)
  })

  it('returns the cards for a known set with cache headers', async () => {
    const response = await GET(request('?set=SOR'))
    assert.strictEqual(response.status, 200)
    assert.match(response.headers.get('cache-control') || '', /max-age=3600/)
    const body = await response.json()
    assert.strictEqual(body.success, true)
    assert.strictEqual(body.data.set, 'SOR')
    assert.ok(body.data.count > 0, 'SOR has cards')
    assert.strictEqual(body.data.cards.length, body.data.count)
    const card = body.data.cards[0]
    assert.ok(card.id && card.name && card.set === 'SOR')
  })

  it('serves corrected (fix-applied) data — same source as the server module', async () => {
    const { getCardsBySet } = await import('@/src/utils/cardData')
    const response = await GET(request('?set=SOR'))
    const body = await response.json()
    assert.strictEqual(body.data.count, getCardsBySet('SOR').length, 'API and server module agree')
  })

  it('returns an empty list (200) for an unknown set', async () => {
    const response = await GET(request('?set=NOPE'))
    assert.strictEqual(response.status, 200)
    const body = await response.json()
    assert.strictEqual(body.data.count, 0)
    assert.deepStrictEqual(body.data.cards, [])
  })

  it('set=all returns the full corrected card list', async () => {
    const { getAllCards } = await import('@/src/utils/cardData')
    const response = await GET(request('?set=all'))
    const body = await response.json()
    assert.strictEqual(body.data.count, getAllCards().length)
  })
})
