import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPackWarsDeckVersion, chooseAiPackWarsPair, missingAspects, unsupportedPackWarsCards, PackWarsUnsupportedError, PACK_WARS_RUNTIME_MIN_DECK_SIZE, type PackWarsCard } from './packWarsDeck'
import { mainDeckSize } from './deckVersions'
import { loadSupport } from './native/savedDeck'
import { PtpPlayError } from './playState'
import { initializeCardCache } from '../../utils/cardCache'
import { generateBoosterPack } from '../../utils/boosterPack'

const support = loadSupport('data/native-support/all.json')
const code = (e: unknown) => (e instanceof PtpPlayError ? e.code : String(e))
const owner = 'owner-1'
async function twoPacks(set = 'SOR'): Promise<PackWarsCard[]> {
  await initializeCardCache()
  return [...generateBoosterPack([], set).cards, ...generateBoosterPack([], set).cards] as unknown as PackWarsCard[]
}
function input(cards: PackWarsCard[], s: Awaited<typeof support>, choice?: { leaderId: string; baseId: string }) {
  return {
    authenticatedUserId: owner,
    pool: { id: 'pool-1', shareId: 'share-1', userId: owner },
    evidence: { sourcePoolId: 'pool-1', setCode: 'SOR', packCount: 2, cards },
    choice: choice ?? { leaderId: cards.find(c => c.type === 'Leader')!.id, baseId: cards.find(c => c.type === 'Base')!.id },
    ...s,
  }
}

test('SPEC: a two-pack Pack Wars deck is the chosen leader and base plus every other main-deck card, no sideboard', async () => {
  const s = await support, cards = await twoPacks()
  assert.equal(cards.length, 32, 'SPEC: a standard booster holds 16 cards')
  const leader = cards.filter(c => c.type === 'Leader')[1]!, base = cards.filter(c => c.type === 'Base')[0]!
  const deck = buildPackWarsDeckVersion(input(cards, s, { leaderId: leader.id, baseId: base.id }))
  assert.equal(deck.poolType, 'pack_wars')
  assert.equal(deck.provenance, 'server-pack-wars')
  assert.equal(deck.packCount, 2)
  assert.equal(deck.leader, s.catalog.get(leader.id)!.engineId)
  assert.equal(deck.base, s.catalog.get(base.id)!.engineId)
  // SPEC: 2 packs x (16 - leader - base) = 28; a foil slot that holds a leader or base sits out too.
  assert.equal(deck.deck.reduce((n, c) => n + c.count, 0), cards.filter(c => c.type !== 'Leader' && c.type !== 'Base').length)
  assert.ok(deck.deck.reduce((n, c) => n + c.count, 0) <= 28)
  assert.deepEqual(deck.sideboard, [])
  // The same packs and choice always freeze the same deck.
  assert.equal(buildPackWarsDeckVersion(input(cards, s, { leaderId: leader.id, baseId: base.id })).contentHash, deck.contentHash)
})

test('the leader and base must come from the packs; a common base from outside the pool is not free in Pack Wars', async () => {
  const s = await support, cards = await twoPacks()
  const leader = cards.find(c => c.type === 'Leader')!, base = cards.find(c => c.type === 'Base')!
  assert.throws(() => buildPackWarsDeckVersion(input(cards, s, { leaderId: base.id, baseId: base.id })), e => code(e) === 'invalid_selection')
  assert.throws(() => buildPackWarsDeckVersion(input(cards, s, { leaderId: leader.id, baseId: leader.id })), e => code(e) === 'invalid_selection')
  const outside = [...s.catalog.values()].find(c => c.type === 'Base' && c.rarity === 'Common' && s.policy.unrestrictedBaseIds.has(c.engineId) && !cards.some(p => p.id === c.id))!
  assert.throws(() => buildPackWarsDeckVersion(input(cards, s, { leaderId: leader.id, baseId: outside.id })), e => code(e) === 'invalid_selection')
})

test('a pool with cards the engine cannot play is refused, naming each card once', async () => {
  const s = await support, cards = await twoPacks()
  const unknown = { id: 'not-a-real-card', name: 'Mystery Card', subtitle: 'Unprinted', type: 'Unit' }
  const pool = [...cards, unknown, unknown]
  assert.deepEqual(unsupportedPackWarsCards(pool, s), ['Mystery Card, Unprinted'])
  assert.throws(() => buildPackWarsDeckVersion(input(pool, s)), (e: unknown) => {
    assert.ok(e instanceof PackWarsUnsupportedError)
    assert.equal(e.status, 409)
    assert.deepEqual(e.cards, ['Mystery Card, Unprinted'])
    assert.match(e.message, /Mystery Card, Unprinted/)
    return true
  })
  // A card in the catalog but not on the engine's supported list is refused too.
  const restricted = { ...s, policy: { ...s.policy, supportedCardIds: new Set([...s.policy.supportedCardIds].filter(id => id !== s.catalog.get(cards[5]!.id)!.engineId)) } }
  assert.throws(() => buildPackWarsDeckVersion(input(cards, restricted)), e => code(e) === 'unsupported_cards')
})

test('ownership, verified source and set support are required', async () => {
  const s = await support, cards = await twoPacks()
  assert.throws(() => buildPackWarsDeckVersion({ ...input(cards, s), authenticatedUserId: 'someone-else' }), e => code(e) === 'not_owner')
  assert.throws(() => buildPackWarsDeckVersion({ ...input(cards, s), evidence: { ...input(cards, s).evidence, sourcePoolId: 'other' } }), e => code(e) === 'unverified_source')
  assert.throws(() => buildPackWarsDeckVersion({ ...input(cards, s), evidence: { ...input(cards, s).evidence, cards: [] } }), e => code(e) === 'unverified_source')
  assert.throws(() => buildPackWarsDeckVersion({ ...input(cards, s), policy: { ...s.policy, supportedSets: new Set(['LAW']) } }), e => code(e) === 'unsupported_set')
})

test('SPEC: limited deck sizes are unchanged; Pack Wars has no 30-card floor and keeps the 100 max', () => {
  assert.deepEqual(mainDeckSize('limited', 'SOR_029'), { minimum: 30, maximum: 100 })
  assert.deepEqual(mainDeckSize('limited', 'JTL_024'), { minimum: 40, maximum: 100 }, 'Data Vault')
  assert.deepEqual(mainDeckSize('limited', 'JTL_025'), { minimum: 25, maximum: 100 }, 'Thermal Oscillator')
  assert.deepEqual(mainDeckSize('pack_wars', 'JTL_024'), { minimum: 1, maximum: 100 })
  assert.equal(PACK_WARS_RUNTIME_MIN_DECK_SIZE, 1)
})

test('SPEC: each aspect icon needs its own leader or base icon', () => {
  const leader = { aspects: ['Vigilance', 'Heroism'] }, base = { aspects: ['Vigilance'] }
  assert.equal(missingAspects({ aspects: ['Vigilance', 'Vigilance'] }, leader, base), 0)
  assert.equal(missingAspects({ aspects: ['Vigilance', 'Vigilance', 'Vigilance'] }, leader, base), 1)
  assert.equal(missingAspects({ aspects: ['Aggression', 'Villainy'] }, leader, base), 2)
  assert.equal(missingAspects({ aspects: [] }, leader, base), 0)
})

test('the AI keeps the leader and base that leave the fewest aspect icons uncovered', () => {
  const cards: PackWarsCard[] = [
    { id: 'red-leader', type: 'Leader', aspects: ['Aggression', 'Villainy'] },
    { id: 'blue-leader', type: 'Leader', aspects: ['Vigilance', 'Heroism'] },
    { id: 'red-base', type: 'Base', aspects: ['Aggression'] },
    { id: 'blue-base', type: 'Base', aspects: ['Vigilance'] },
    { id: 'u1', type: 'Unit', aspects: ['Vigilance', 'Heroism'] },
    { id: 'u2', type: 'Unit', aspects: ['Vigilance'] },
    { id: 'u3', type: 'Event', aspects: ['Aggression'] },
  ]
  // Blue leader + red base covers every icon (penalty 0); blue + blue leaves the Aggression event uncovered.
  assert.deepEqual(chooseAiPackWarsPair(cards, c => String(c.type)), { leaderId: 'blue-leader', baseId: 'red-base' })
  // Without the red base both leaders leave one icon uncovered: the tie goes to pack order.
  assert.deepEqual(chooseAiPackWarsPair(cards.filter(c => c.id !== 'red-base'), c => String(c.type)), { leaderId: 'red-leader', baseId: 'blue-base' })
  assert.equal(chooseAiPackWarsPair(cards.filter(c => c.type !== 'Base'), c => String(c.type)), null)
})
