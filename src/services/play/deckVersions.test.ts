import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildNativeDeckVersion, type NativeDeckInput } from './deckVersions'

function fixture(): NativeDeckInput {
  const cards = [
    { id: 'leader', engineId: 'SOR_001', type: 'Leader' as const, rarity: 'Rare' },
    { id: 'base', engineId: 'SOR_020', type: 'Base' as const, rarity: 'Common' },
    { id: 'unit', engineId: 'SOR_100', type: 'Unit' as const, rarity: 'Common' },
    { id: 'foil', engineId: 'SOR_100', type: 'Unit' as const, rarity: 'Common' },
  ]
  return {
    authenticatedUserId: 'owner',
    pool: { id: 'build', shareId: 'share', userId: 'owner', sourcePoolId: 'source', deckBuilderState: {
      activeLeader: 'l', activeBase: 'b', cardPositions: {
        l: { card: { id: 'leader' } }, b: { card: { id: 'base' } },
        ...Object.fromEntries(Array.from({ length: 30 }, (_, i) => [String(i), { section: 'deck', card: { id: i === 0 ? 'foil' : 'unit' } }])),
      },
    } },
    evidence: { sourcePoolId: 'source', kind: 'server-sealed', setCode: 'SOR', poolType: 'sealed', packCount: 6,
      cards: [{ id: 'leader' }, ...Array.from({ length: 30 }, () => ({ id: 'unit' }))] },
    catalog: new Map(cards.map(card => [card.id, card])),
    policy: { version: 'engine-rev/support-v1', supportedSets: new Set(['SOR']), supportedCardIds: new Set(['SOR_001', 'SOR_020', 'SOR_100']), unrestrictedBaseIds: new Set(['SOR_020']) },
  }
}
const state = (input: NativeDeckInput) => input.pool.deckBuilderState as { activeLeader: string; activeBase: string; cardPositions: Record<string, { section?: string; enabled?: boolean; card: { id: string; isLeader?: boolean } }> }
const rejects = (input: NativeDeckInput, code: string) => assert.throws(() => buildNativeDeckVersion(input), { code })

describe('native immutable limited deck snapshots', () => {
  it('canonicalizes print variants, counts every limited copy, and freezes authoritative provenance', () => {
    const input = fixture()
    const deck = buildNativeDeckVersion(input)
    assert.deepEqual(deck.deck, [{ id: 'SOR_100', count: 30 }])
    assert.equal(deck.leader, 'SOR_001')
    assert.equal(deck.base, 'SOR_020')
    assert.equal(deck.packCount, 6)
    state(input).cardPositions['0'].card.id = 'base'
    assert.deepEqual(deck.deck, [{ id: 'SOR_100', count: 30 }])
    assert.equal(Object.isFrozen(deck.deck[0]), true)
  })
  it('produces stable hashes despite UI ordering, and distinguishes format/provenance/support changes', () => {
    const input = fixture()
    const first = buildNativeDeckVersion(input).contentHash
    state(input).cardPositions = Object.fromEntries(Object.entries(state(input).cardPositions).reverse())
    assert.equal(buildNativeDeckVersion(input).contentHash, first)
    input.evidence.packCount = 8
    assert.notEqual(buildNativeDeckVersion(input).contentHash, first)
  })
  it('rejects another user and mismatched source evidence', () => {
    const input = fixture(); input.authenticatedUserId = 'attacker'; rejects(input, 'not_owner')
    input.authenticatedUserId = 'owner'; input.evidence.sourcePoolId = 'other'; rejects(input, 'unverified_source')
  })
  it('requires authoritative pack provenance rather than falling back to six packs', () => {
    const input = fixture(); input.evidence.packCount = 0; rejects(input, 'unverified_source')
    input.evidence.packCount = 6; input.evidence.kind = 'server-draft'; rejects(input, 'unverified_source')
  })
  it('rejects unsupported sets and cards instead of guessing engine coverage', () => {
    const input = fixture(); input.evidence.setCode = 'SHD'; rejects(input, 'unsupported_set')
    input.evidence.setCode = 'SOR'; input.policy.supportedCardIds = new Set(['SOR_001', 'SOR_020']); rejects(input, 'unsupported_card')
  })
  it('rejects injected copies beyond the verified pool, including a rare base', () => {
    const input = fixture(); input.evidence.cards.pop(); rejects(input, 'outside_pool')
    const other = fixture(); other.policy.unrestrictedBaseIds = new Set(); rejects(other, 'outside_pool')
  })
  it('uses catalog identity and type rather than editable display fields', () => {
    const input = fixture(); state(input).cardPositions['0'].card.isLeader = true
    assert.equal(buildNativeDeckVersion(input).deck[0].count, 30)
    state(input).cardPositions['0'].card.id = 'made-up'; rejects(input, 'unknown_card')
  })
  it('rejects missing leaders, disabled cards, nonplayable deck cards and undersized decks', () => {
    const input = fixture(); state(input).activeLeader = 'missing'; rejects(input, 'invalid_selection')
    const disabled = fixture(); state(disabled).cardPositions['0'].enabled = false; rejects(disabled, 'deck_too_small')
    const wrong = fixture(); state(wrong).cardPositions['0'].card.id = 'base'; rejects(wrong, 'invalid_card_type')
  })
  it('fails malformed saved state instead of silently launching an older or partial deck', () => {
    const input = fixture(); input.pool.deckBuilderState = '{'; rejects(input, 'invalid_saved_deck')
    input.pool.deckBuilderState = { cardPositions: [] }; rejects(input, 'invalid_saved_deck')
  })
})
it('Data Vault requires forty limited main-deck cards, not the normal thirty', () => {
  const input = fixture()
  input.catalog = new Map([...input.catalog, ['base', { id: 'base', engineId: 'JTL_024', type: 'Base', rarity: 'Rare' }]])
  input.policy.supportedCardIds = new Set([...input.policy.supportedCardIds, 'JTL_024'])
  input.evidence.cards = [...input.evidence.cards, { id: 'base' }, ...Array.from({ length: 10 }, () => ({ id: 'unit' }))]
  rejects(input, 'deck_too_small')
  for (let i = 30; i < 40; i++) state(input).cardPositions[String(i)] = { section: 'deck', card: { id: 'unit' } }
  assert.deepEqual(buildNativeDeckVersion(input).deck, [{ id: 'SOR_100', count: 40 }])
})

it('Thermal Oscillator permits twenty-five cards and rejects twenty-four',()=>{
  const input=fixture()
  input.catalog=new Map([...input.catalog,['base',{id:'base',engineId:'JTL_025',type:'Base',rarity:'Rare'}]])
  input.policy.supportedCardIds=new Set([...input.policy.supportedCardIds,'JTL_025'])
  input.evidence.cards=[...input.evidence.cards,{id:'base'}]
  for(let i=25;i<30;i++)delete state(input).cardPositions[String(i)]
  assert.equal(buildNativeDeckVersion(input).deck[0].count,25)
  delete state(input).cardPositions['24'];rejects(input,'deck_too_small')
})
it('runtime capacity admits one hundred cards but rejects one hundred one before reservation',()=>{
  const input=fixture();input.evidence.packCount=8
  input.evidence.cards=[...input.evidence.cards,...Array.from({length:71},()=>({id:'unit'}))]
  for(let i=30;i<100;i++)state(input).cardPositions[String(i)]={section:'deck',card:{id:'unit'}}
  assert.equal(buildNativeDeckVersion(input).deck[0].count,100)
  state(input).cardPositions['100']={section:'deck',card:{id:'unit'}};rejects(input,'runtime_deck_limit')
})

it('accepts saved sealed provenance only for solo and retains pool restrictions',()=>{
 const input=fixture();input.evidence.kind='saved-sealed';
 rejects(input,'unverified_source');
 input.allowSavedSealed=true;
 assert.equal(buildNativeDeckVersion(input).provenance,'saved-sealed');
 input.evidence.cards.pop();rejects(input,'outside_pool');
});
