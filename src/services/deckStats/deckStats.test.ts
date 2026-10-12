import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  aspectPairings,
  aspectRows,
  baseSynergyTiles,
  bombNames,
  costCurve,
  deckSummary,
  kindRows,
  labelRows,
  rarityRows,
  referencesBaseTrait,
  type StatsCard,
} from './index'
import { getCardsBySet } from '../../utils/cardData'
import { HMW_CONFIG } from '../../utils/setConfigs/HMW'
import type { ActiveRatingSet } from '../cardDataContract'

const unit = (name: string, cost: number, aspects: string[], extra: Partial<StatsCard> = {}): StatsCard =>
  ({ name, cost, aspects, type: 'Unit', arenas: ['Ground'], rarity: 'Common', ...extra })

// Leader Command/Heroism + Command base: Command and Heroism are free, everything else costs +2 per icon.
const leader: StatsCard = { name: 'Tarfful', set: 'HMW', aspects: ['Command', 'Heroism'] }
const base: StatsCard = { name: 'Origin Tree', aspects: ['Command'], traits: ['Kashyyyk'] }

const deck: StatsCard[] = [
  unit('Cheap Command', 1, ['Command'], { traits: ['Wookiee'], keywords: ['Raid'] }),
  unit('Two Drop Hero', 2, ['Command', 'Heroism'], { traits: ['Wookiee', 'Rebel'] }),
  unit('Off Aspect One', 1, ['Vigilance']), // 1 + 2 penalty = 3, not a T1 play
  unit('Big Space', 9, ['Command'], { arenas: ['Space'], rarity: 'Legendary', keywords: ['Raid', 'Overwhelm'] }),
  { name: 'Neutral Event', cost: 3, aspects: [], type: 'Event', rarity: 'Uncommon' },
]
const sideboard: StatsCard[] = [
  unit('Villain Pair', 4, ['Command', 'Villainy'], { rarity: 'Rare' }),
  unit('Vig Pair', 2, ['Vigilance', 'Villainy']),
  { name: 'Some Upgrade', cost: 0, aspects: ['Command'], type: 'Upgrade', rarity: 'Common' },
]
const pool = [...deck, ...sideboard]

describe('deckSummary', () => {
  const summary = deckSummary(deck, pool, leader, base)
  it('counts deck and pool sizes', () => {
    assert.strictEqual(summary.deckCount, 5)
    assert.strictEqual(summary.poolCount, 8)
  })
  it('averages printed cost', () => {
    assert.strictEqual(summary.avgCost, (1 + 2 + 1 + 9 + 3) / 5)
  })
  it('splits units into ground and space', () => {
    assert.strictEqual(summary.groundUnits, 3)
    assert.strictEqual(summary.spaceUnits, 1)
  })
  it('SPEC: T1 plays are cards costing <= 2 after the aspect penalty', () => {
    // Cheap Command (1), Two Drop Hero (2). Off Aspect One costs 3 after penalty.
    assert.strictEqual(summary.turnOnePlays, 2)
    // Pool adds Some Upgrade (0). Vig Pair is 2 + 4 penalty.
    assert.strictEqual(summary.poolTurnOnePlays, 3)
  })
  it('lists deck cards paying an aspect penalty', () => {
    assert.deepStrictEqual(summary.penaltyCards, ['Off Aspect One'])
  })
})

describe('aspectRows', () => {
  const rows = aspectRows(deck, pool, leader, base)
  const row = (key: string) => rows.find(r => r.key === key)
  it('counts each aspect once per card, deck over pool', () => {
    assert.deepStrictEqual([row('Command')?.primary, row('Command')?.pool], [3, 5])
    assert.deepStrictEqual([row('Villainy')?.primary, row('Villainy')?.pool], [0, 2])
  })
  it('marks aspects provided by the leader and base', () => {
    assert.strictEqual(row('Command')?.provided, true)
    assert.strictEqual(row('Heroism')?.provided, true)
    assert.strictEqual(row('Vigilance')?.provided, false)
  })
  it('flags off-aspect penalties only when the deck plays that aspect', () => {
    assert.strictEqual(row('Vigilance')?.penalized, true)
    assert.strictEqual(row('Villainy')?.penalized, false)
  })
  it('puts aspectless cards under Neutral', () => {
    assert.deepStrictEqual([row('Neutral')?.primary, row('Neutral')?.pool], [1, 1])
  })
})

describe('aspectPairings', () => {
  it('splits an aspect by its partner, with "" for the aspect alone', () => {
    const pairs = Object.fromEntries(aspectPairings('Command', deck, pool).map(p => [p.key, [p.primary, p.pool]]))
    assert.deepStrictEqual(pairs, { '': [2, 3], Heroism: [1, 1], Villainy: [0, 1] })
  })
  it('keys a doubled aspect by the aspect itself', () => {
    const double = [unit('Double Vig', 3, ['Vigilance', 'Vigilance'])]
    assert.deepStrictEqual(aspectPairings('Vigilance', double, double).map(p => p.key), ['Vigilance'])
  })
})

describe('costCurve', () => {
  const curve = costCurve(deck, pool)
  it('has buckets 0 through 7, with 7 holding 7+', () => {
    assert.deepStrictEqual(curve.map(b => b.cost), [0, 1, 2, 3, 4, 5, 6, 7])
    assert.strictEqual(curve[7].primary.space, 1)
  })
  it('stacks each bucket by ground, space, event and upgrade', () => {
    assert.deepStrictEqual(curve[1].primary, { ground: 2, space: 0, event: 0, upgrade: 0 })
    assert.deepStrictEqual(curve[3].primary, { ground: 0, space: 0, event: 1, upgrade: 0 })
  })
  it('carries the pool total behind each bucket', () => {
    assert.deepStrictEqual(curve.map(b => b.pool), [1, 2, 2, 1, 1, 0, 0, 1])
  })
})

describe('kindRows and rarityRows', () => {
  it('counts card kinds', () => {
    assert.deepStrictEqual(kindRows(deck, pool).map(r => [r.key, r.primary, r.pool]),
      [['ground', 3, 5], ['space', 1, 1], ['event', 1, 1], ['upgrade', 0, 1]])
  })
  it('SPEC: rarity always lists all five rarities, even at zero', () => {
    assert.deepStrictEqual(rarityRows(deck, pool).map(r => [r.key, r.primary, r.pool]),
      [['Common', 3, 5], ['Uncommon', 1, 1], ['Rare', 0, 1], ['Legendary', 1, 1], ['Special', 0, 0]])
  })
})

describe('labelRows', () => {
  it('counts traits, most common in the deck first', () => {
    assert.deepStrictEqual(labelRows(deck, pool, 'traits').map(r => [r.key, r.primary]), [['Wookiee', 2], ['Rebel', 1]])
  })
  it('counts keywords', () => {
    assert.deepStrictEqual(labelRows(deck, pool, 'keywords').map(r => [r.key, r.primary]), [['Raid', 2], ['Overwhelm', 1]])
  })
})

describe('base synergy', () => {
  it('matches "a <trait> base" and lists of traits before "base"', () => {
    assert.ok(referencesBaseTrait({ name: 'a', frontText: 'While you control a Naboo base, this unit gains Grit.' }, 'Naboo'))
    assert.ok(referencesBaseTrait({ name: 'b', frontText: 'If you control an Endor, Naboo, or Tatooine base, draw.' }, 'Endor'))
    assert.ok(!referencesBaseTrait({ name: 'c', frontText: 'Deal 2 damage to a base.' }, 'Naboo'))
  })

  it('SPEC: HMW names the four planet traits', () => {
    assert.deepStrictEqual(HMW_CONFIG.baseTraitSynergy, ['Kashyyyk', 'Naboo', 'Endor', 'Tatooine'])
  })

  it('builds one tile per trait from real HMW cards: 4 bases each, cards that reference it', () => {
    const hmw = getCardsBySet('HMW').filter(c => (c as StatsCard & { variantType?: string }).variantType === 'Normal') as StatsCard[]
    const bases = hmw.filter(c => c.type === 'Base')
    const rangers = hmw.find(c => c.name === 'Wookiee Rangers')!
    const torrent = hmw.find(c => c.name === 'Torrent')!
    const origin = bases.find(c => c.name === 'Origin Tree')!
    const tiles = baseSynergyTiles({ traits: HMW_CONFIG.baseTraitSynergy!, deck: [rangers, rangers], sideboard: [torrent], setBases: bases, currentBase: origin })
    const kashyyyk = tiles.find(t => t.trait === 'Kashyyyk')!
    const naboo = tiles.find(t => t.trait === 'Naboo')!
    // Spec: "Each primary aspect has FOUR Common bases, one per new base trait" (HMW.ts)
    assert.deepStrictEqual(tiles.map(t => t.bases.length), [4, 4, 4, 4])
    assert.deepStrictEqual(kashyyyk.deck, [{ name: 'Wookiee Rangers', aspects: rangers.aspects, count: 2 }])
    assert.strictEqual(kashyyyk.isCurrent, true)
    assert.deepStrictEqual([naboo.deckCount, naboo.poolCount, naboo.sideboard[0].name], [0, 1, 'Torrent'])
  })
})

describe('bombNames', () => {
  const entry = (grade: string) => ({ score: 0, grade, basis: 'gih', version: 'v' })
  const manifest = (status: ActiveRatingSet['status']): Record<string, ActiveRatingSet> => ({
    HMW: { set: 'HMW', status, reason: '', basis: 'gih', version: 'v', leaders: {}, cards: {
      'big space|': entry('A-'), 'cheap command|': entry('B+'),
    } },
  })
  it('SPEC: bombs are A- or better in published ratings', () => {
    assert.deepStrictEqual(bombNames(deck, 'HMW', manifest('published')), ['Big Space'])
  })
  it('returns null when the set has no published ratings', () => {
    assert.strictEqual(bombNames(deck, 'HMW', manifest('inconclusive')), null)
  })
})
