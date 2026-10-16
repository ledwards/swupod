import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { poolPacks, poolDecks, groupBuildsByAuthor, reparentTarget, canDeleteBuild, buildHref, type PoolBuild } from './poolPage'

const card = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, ...extra })
const cards = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => card(`${prefix}${i}`))

// Spec (pool page): a draft pool shows its leaders, then Round 1–3 of 14 cards each.
describe('poolPacks: draft', () => {
  it('Leaders first, then three rounds of 14', () => {
    const leaders = [card('L1', { isLeader: true }), card('L2', { type: 'Leader' })]
    const packs = poolPacks({ poolType: 'draft', cards: [...leaders, ...cards('c', 42)] })
    assert.deepEqual(packs.map(p => [p.name, p.cards.length]), [['Leaders', 2], ['Round 1', 14], ['Round 2', 14], ['Round 3', 14]])
  })
  it('reads the cards out of saved packs too, and drops empty rounds', () => {
    const packs = poolPacks({ poolType: 'draft', packs: [{ cards: cards('a', 10) }, { cards: cards('b', 6) }] })
    assert.deepEqual(packs.map(p => [p.name, p.cards.length]), [['Round 1', 14], ['Round 2', 2]])
  })
})

// Spec: a sealed pool shows its packs as saved (Pack 1…N); a flat pool is one pack.
describe('poolPacks: sealed', () => {
  it('keeps saved packs and numbers them', () => {
    const packs = poolPacks({ poolType: 'sealed', packs: [{ cards: cards('a', 16) }, { cards: cards('b', 16) }] })
    assert.deepEqual(packs.map(p => [p.name, p.cards.length]), [['Pack 1', 16], ['Pack 2', 16]])
  })
  it('a named pack keeps its name', () => {
    assert.equal(poolPacks({ poolType: 'sealed', packs: [{ name: 'Event Pack', cards: cards('a', 3) }] })[0]!.name, 'Event Pack')
  })
  it('flat cards become one pack; nothing becomes no packs', () => {
    assert.deepEqual(poolPacks({ poolType: 'sealed', cards: cards('x', 5) }).map(p => p.cards.length), [5])
    assert.deepEqual(poolPacks({ poolType: 'sealed' }), [])
  })
})

const build = (over: Partial<PoolBuild>): PoolBuild => ({
  shareId: 's', builderName: 'Kestrel', builderUserId: 'u1', isOriginal: false, leaderName: 'Leia', baseName: 'Echo Base',
  deckCardCount: 30, wins: 0, losses: 0, draws: 0, createdAt: '2026-10-01', ...over,
})

// Spec: only entries that are a deck (a leader or any deck cards) show.
describe('poolDecks', () => {
  it('hides empty entries', () => {
    const decks = poolDecks([build({ shareId: 'a' }), build({ shareId: 'b', leaderName: null, deckCardCount: 0 }), build({ shareId: 'c', leaderName: null, deckCardCount: 3 })])
    assert.deepEqual(decks.map(d => d.shareId), ['a', 'c'])
  })
})

// Spec (All Builds): the original first as "Original (owner)", then each builder by newest build, anonymous last.
describe('groupBuildsByAuthor', () => {
  it('orders original, newest builder, older builder, anonymous', () => {
    const groups = groupBuildsByAuthor([
      build({ shareId: 'o', isOriginal: true, builderName: 'Kestrel' }),
      build({ shareId: 'anon', builderUserId: null, builderName: null, createdAt: '2026-10-09' }),
      build({ shareId: 'b1', builderUserId: 'u2', builderName: 'Bodhi', createdAt: '2026-10-02' }),
      build({ shareId: 'j1', builderUserId: 'u3', builderName: 'Jyn', createdAt: '2026-10-05' }),
      build({ shareId: 'b2', builderUserId: 'u2', builderName: 'Bodhi', createdAt: '2026-10-03' }),
    ])
    assert.deepEqual(groups.map(g => [g.label, g.builds.map(b => b.shareId)]), [
      ['Original (Kestrel)', ['o']], ['Jyn', ['j1']], ['Bodhi', ['b1', 'b2']], ['Anonymous', ['anon']],
    ])
  })
})

// Spec: deleting your original promotes your oldest other build on the pool; with none, the whole pool goes.
describe('reparentTarget', () => {
  const builds = [
    build({ shareId: 'o', isOriginal: true }),
    build({ shareId: 'new', createdAt: '2026-10-09' }),
    build({ shareId: 'old', createdAt: '2026-10-02' }),
    build({ shareId: 'theirs', builderUserId: 'u9', createdAt: '2026-09-01' }),
  ]
  it('picks your oldest other build', () => {
    assert.equal(reparentTarget(builds, builds[0]!, 'u1')?.shareId, 'old')
  })
  it('none for a non-original or when you have no other build', () => {
    assert.equal(reparentTarget(builds, builds[1]!, 'u1'), null)
    assert.equal(reparentTarget([builds[0]!], builds[0]!, 'u1'), null)
  })
})

// Spec: you can delete your own deck anywhere, or any deck on a pool you own.
describe('canDeleteBuild', () => {
  it('own deck, or the pool owner', () => {
    assert.equal(canDeleteBuild(build({ builderUserId: 'u1' }), 'u1', false), true)
    assert.equal(canDeleteBuild(build({ builderUserId: 'u2' }), 'u1', true), true)
    assert.equal(canDeleteBuild(build({ builderUserId: 'u2' }), 'u1', false), false)
    assert.equal(canDeleteBuild(build({ builderUserId: 'u2' }), null, false), false)
  })
})

// Spec: the original opens the pool's deck builder; other builds open /pools/<root>/deck/<build>.
describe('buildHref', () => {
  it('original and child builds', () => {
    assert.equal(buildHref('root', build({ isOriginal: true })), '/pools/root/deck')
    assert.equal(buildHref('root', build({ shareId: 'kid' })), '/pools/root/deck/kid')
  })
})
