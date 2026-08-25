import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { selectDeckImageCards, selectDeckImageTitle } from './deckImageSelection.ts'

const leaderCard = { id: 'u-leader', cardId: 'ASH-005', name: 'Luke Skywalker', isLeader: true }
const otherLeader = { id: 'u-leader-2', cardId: 'ASH-015', name: 'Emperor Palpatine', isLeader: true }
const baseCard = { id: 'u-base', cardId: 'ASH-024', name: 'Nevarro City', isBase: true }
const otherBase = { id: 'u-base-2', cardId: 'ASH-025', name: 'Echo Base', isBase: true }
const unit = (n: number) => ({ id: `u-${n}`, cardId: `ASH-1${n}`, name: `Unit ${n}` })

describe('selectDeckImageCards', () => {
  it('picks the active leader and base, not whichever the pool happens to list first', () => {
    const { leader, base } = selectDeckImageCards({
      activeLeader: 'leader-1-u-leader',
      activeBase: 'base-1-u-base',
      cardPositions: {
        'leader-0-u-leader-2': { card: otherLeader, section: 'leaders', visible: true },
        'base-0-u-base-2': { card: otherBase, section: 'bases', visible: true },
        'leader-1-u-leader': { card: leaderCard, section: 'leaders', visible: true },
        'base-1-u-base': { card: baseCard, section: 'bases', visible: true },
      },
    })

    assert.equal(leader?.id, 'u-leader')
    assert.equal(base?.id, 'u-base')
  })

  it('falls back to any leader/base when the active selection is missing', () => {
    const { leader, base } = selectDeckImageCards({
      cardPositions: {
        'leader-0-u-leader': { card: leaderCard, section: 'leaders', visible: true },
        'base-0-u-base': { card: baseCard, section: 'bases', visible: true },
      },
    })

    assert.equal(leader?.id, 'u-leader')
    assert.equal(base?.id, 'u-base')
  })

  it('BUGGY: hidden and disabled deck cards were counted as part of the deck', () => {
    // The share image took every position in the `deck` section. The deck.json
    // export and the in-app deck pane both require visible + enabled, so the
    // image showed cards the owner had toggled off.
    const { deckCards } = selectDeckImageCards({
      activeLeader: 'leader-0-u-leader',
      activeBase: 'base-0-u-base',
      cardPositions: {
        'leader-0-u-leader': { card: leaderCard, section: 'leaders', visible: true },
        'base-0-u-base': { card: baseCard, section: 'bases', visible: true },
        'pool-0-u-1': { card: unit(1), section: 'deck', visible: true, enabled: true },
        'pool-1-u-2': { card: unit(2), section: 'deck', visible: false },
        'pool-2-u-3': { card: unit(3), section: 'deck', visible: true, enabled: false },
        'pool-3-u-4': { card: unit(4), section: 'sideboard', visible: true },
      },
    })

    assert.deepEqual(deckCards.map(c => c.id), ['u-1'])
  })

  it('never lets a leader or base leak into the deck grid', () => {
    const { deckCards } = selectDeckImageCards({
      activeLeader: 'leader-0-u-leader',
      activeBase: 'base-0-u-base',
      cardPositions: {
        'leader-0-u-leader': { card: leaderCard, section: 'deck', visible: true },
        'base-0-u-base': { card: baseCard, section: 'deck', visible: true },
        'pool-0-u-1': { card: unit(1), section: 'deck', visible: true },
      },
    })

    assert.deepEqual(deckCards.map(c => c.id), ['u-1'])
  })

  it('returns an empty selection for a pool with no saved state', () => {
    assert.deepEqual(selectDeckImageCards(null), { leader: null, base: null, deckCards: [] })
  })
})

describe('selectDeckImageTitle', () => {
  const pool = { name: 'ASH Sealed', set_code: 'ASH', pool_type: 'sealed' }

  it('BUGGY: a renamed pool kept its old title in the share image', () => {
    // Renaming a pool writes deckBuilderState.poolName and leaves the name
    // column behind, so the share image read a name the owner had replaced.
    assert.equal(
      selectDeckImageTitle({ poolName: 'Pod Night Sealed' }, pool),
      'Pod Night Sealed'
    )
  })

  it('falls back to the row name when the state carries none', () => {
    assert.equal(selectDeckImageTitle({}, pool), 'ASH Sealed')
    assert.equal(selectDeckImageTitle(null, pool), 'ASH Sealed')
  })

  it('generates a set label when the pool was never named', () => {
    assert.equal(selectDeckImageTitle(null, { set_code: 'ASH', pool_type: 'sealed' }), 'ASH Sealed')
    assert.equal(selectDeckImageTitle(null, { set_code: 'ASH', pool_type: 'draft' }), 'ASH Draft')
    // Rotisserie is a draft format, not a sealed one.
    assert.equal(selectDeckImageTitle(null, { set_code: 'ASH', pool_type: 'rotisserie' }), 'ASH Draft')
    // Chaos pools carry a comma-separated set code.
    assert.equal(selectDeckImageTitle(null, { set_code: 'SOR,JTL', pool_type: 'draft' }), 'Chaos Draft')
  })

  it('never renders an empty title', () => {
    assert.equal(selectDeckImageTitle(null, {}), 'Sealed')
  })
})
