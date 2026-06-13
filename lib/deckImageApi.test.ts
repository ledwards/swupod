import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateDeckImage } from './deckImageApi.ts'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('generateDeckImage', () => {
  it('sends limited layout requests to swuapi', async () => {
    let capturedUrl = ''
    let capturedBody: Record<string, any> | null = null

    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      capturedUrl = String(url)
      capturedBody = JSON.parse(String(init?.body))
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 })
    }

    const buffer = await generateDeckImage({
      leader: { name: 'Fennec Shand', cardId: 'JTL-179' },
      base: { name: 'Fortress of the Great Mothers', cardId: 'LOF-030' },
      deckCards: [
        { name: 'Alamite Hunter', cardId: 'LOF-119' },
        { name: 'Alamite Hunter', cardId: 'LOF-119' },
      ],
      title: 'Fennec Shand',
      subtitle: 'DraftBot Theta',
      poolUrl: 'https://protectthepod.com/draft-pool/test',
      layout: 'limited',
    })

    assert.ok(buffer)
    assert.equal(capturedUrl, 'https://api.swuapi.com/deck-image')
    assert.ok(capturedBody)
    assert.equal(capturedBody.layout, 'limited')
    assert.deepEqual(capturedBody.branding, { url: 'https://protectthepod.com/draft-pool/test' })
    assert.equal(capturedBody.cards[0].id, 'JTL_179')
    assert.equal(capturedBody.cards[1].id, 'LOF_030')
    assert.equal(capturedBody.cards[2].id, 'LOF_119')
    assert.equal(capturedBody.cards[2].count, 2)
  })
})
