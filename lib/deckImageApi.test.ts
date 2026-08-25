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

  it('BUGGY/FIXED: variant printings are sent as their Normal collector number', async () => {
    // swuapi identifies a card by its NORMAL collector number and selects the
    // printing with `variant`. Hyperspace/Showcase/Prestige printings carry
    // their OWN collector number (ASH-005 Normal -> ASH-269 Hyperspace ->
    // ASH-771 Showcase), so sending that number alongside `variant` asked
    // swuapi for the Hyperspace printing OF the Hyperspace printing and it
    // rendered a grey "Unknown" tile instead of the card.
    let capturedBody: Record<string, any> | null = null
    globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      capturedBody = JSON.parse(String(init?.body))
      return new Response(new Uint8Array([1]), { status: 200 })
    }

    await generateDeckImage({
      // Hyperspace leader — ASH-269 is the Hyperspace printing of ASH-005.
      leader: { name: 'Luke Skywalker', subtitle: 'I Can Save Him', cardId: 'ASH-269', variantType: 'Hyperspace' },
      base: { name: 'Nevarro City', subtitle: 'Restored', cardId: 'ASH-024' },
      deckCards: [
        // Hyperspace Foil printing of SOR-214.
        { name: 'Smuggling Compartment', cardId: 'SOR-476', variantType: 'Hyperspace Foil' },
        // Standard Foil already shares the Normal number — must stay put.
        { name: 'Smuggling Compartment', cardId: 'SOR-214', variantType: 'Foil' },
      ],
      layout: 'limited',
    })

    assert.ok(capturedBody)
    const [leader, base, ...deck] = capturedBody.cards
    assert.equal(leader.id, 'ASH_005', 'SPEC: leader resolves to its Normal collector number')
    assert.equal(leader.variant, 'Hyperspace')
    assert.equal(leader.type, 'Leader')
    assert.equal(base.id, 'ASH_024')
    // Both printings are the same game piece -> one tile, count 2.
    assert.equal(deck.length, 1, 'SPEC: printings of one card merge into a single tile')
    assert.equal(deck[0].id, 'SOR_214')
    assert.equal(deck[0].count, 2)
  })

  it('FIXED: treatments swuapi does not model fall back to standard art', async () => {
    // Prestige tiers and promo treatments are not swuapi variants, and their
    // collector numbers (JTL-1093 etc.) are not the card's number. Send the
    // Normal number with no variant so the card renders instead of going Unknown.
    let capturedBody: Record<string, any> | null = null
    globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      capturedBody = JSON.parse(String(init?.body))
      return new Response(new Uint8Array([1]), { status: 200 })
    }

    await generateDeckImage({
      leader: { name: 'Fennec Shand', cardId: 'JTL-179' },
      base: { name: 'Fortress of the Great Mothers', cardId: 'LOF-030' },
      deckCards: [{ name: 'Gold Leader', cardId: 'JTL-1093', variantType: 'Serialized Prestige' }],
      layout: 'limited',
    })

    assert.ok(capturedBody)
    const card = capturedBody.cards[2]
    assert.equal(card.variant, undefined, 'SPEC: unknown treatments carry no variant')
    assert.notEqual(card.id, 'JTL_1093', 'SPEC: prestige collector numbers never reach swuapi')
  })

  it('FIXED: a card with no cardId still resolves through its catalog uuid', async () => {
    let capturedBody: Record<string, any> | null = null
    globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      capturedBody = JSON.parse(String(init?.body))
      return new Response(new Uint8Array([1]), { status: 200 })
    }

    const { getAllCards } = await import('../src/utils/cardData.ts')
    const hyperspace = getAllCards().find(
      (c: any) => c.set === 'ASH' && c.variantType === 'Hyperspace' && !c.isLeader && !c.isBase
    )
    const normal = getAllCards().find(
      (c: any) => c.set === 'ASH' && c.variantType === 'Normal' && c.name === hyperspace.name &&
        c.type === hyperspace.type && (c.subtitle || '') === (hyperspace.subtitle || '')
    )

    await generateDeckImage({
      leader: { name: 'Fennec Shand', cardId: 'JTL-179' },
      base: { name: 'Fortress of the Great Mothers', cardId: 'LOF-030' },
      deckCards: [{ name: hyperspace.name, id: hyperspace.id }],
      layout: 'limited',
    })

    assert.ok(capturedBody)
    assert.equal(capturedBody.cards[2].id, normal.cardId.replace('-', '_'))
  })

  it('FIXED: a shared collector number resolves by uuid, not by number', async () => {
    // SEC-571 is BOTH Willrow Hood and Bardottan Ornithopter. Resolving by
    // number alone picks whichever the catalog indexed first, so the share
    // image would show a card the player never had.
    let capturedBody: Record<string, any> | null = null
    globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      capturedBody = JSON.parse(String(init?.body))
      return new Response(new Uint8Array([1]), { status: 200 })
    }

    const { getAllCards } = await import('../src/utils/cardData.ts')
    const all = getAllCards() as any[]
    const shared = all.filter(c => c.cardId === 'SEC-571')
    assert.equal(shared.length, 2, 'fixture: SEC-571 is shared by two different cards')

    await generateDeckImage({
      leader: { name: 'Fennec Shand', cardId: 'JTL-179' },
      base: { name: 'Fortress of the Great Mothers', cardId: 'LOF-030' },
      deckCards: shared.map(c => ({ name: c.name, id: c.id, cardId: c.cardId, variantType: c.variantType })),
      layout: 'limited',
    })

    assert.ok(capturedBody)
    const deck = capturedBody.cards.slice(2)
    const normalIds = shared.map(c => {
      const normal = all.find(n => n.variantType === 'Normal' && n.set === c.set && n.name === c.name &&
        n.type === c.type && (n.subtitle || '') === (c.subtitle || ''))
      return normal.cardId.replace('-', '_')
    })
    assert.equal(new Set(normalIds).size, 2, 'fixture: the two cards have different Normal numbers')
    assert.deepEqual(deck.map((c: any) => c.id).sort(), [...normalIds].sort())
  })
})
