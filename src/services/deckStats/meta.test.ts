import { describe, it } from 'node:test'
import assert from 'node:assert'
import { deckAverage, formatAverage, metaRows, metaScore, MIN_META_SAMPLE, sideboardUpgrades, type CardMetaStats } from './meta'

const card = (name: string, aspects = ['Command']) => ({ name, aspects })
const stats = (cardName: string, gihWr: number, gihCount: number, extra: Partial<CardMetaStats> = {}): CardMetaStats =>
  ({ cardName, gihWr, gihCount, gihWins: Math.round((gihWr / 100) * gihCount), gpWr: 50, gpCount: 200, ...extra })

describe('metaScore', () => {
  it('uses GIH WR when there is hand data', () => {
    assert.deepStrictEqual(metaScore(stats('A', 58, 120)), { score: 58, sample: 120 })
  })
  it('falls back to GP WR without hand data', () => {
    assert.deepStrictEqual(metaScore({ cardName: 'B', gihCount: null, gihWr: null, gpWr: 61, gpCount: 40 }), { score: 61, sample: 40 })
  })
  it('is empty with no stats', () => {
    assert.deepStrictEqual(metaScore(null), { score: null, sample: 0 })
  })
})

describe('metaRows', () => {
  const data = [stats('Good', 60, 300), stats('Bad', 45, 300), { cardName: 'Same Name', subtitle: 'Two', gihWr: 55, gihCount: 100 }]
  it('groups copies, keeps deck and sideboard apart, best first', () => {
    const rows = metaRows([card('Bad'), card('Good'), card('Good')], [card('Good')], data)
    assert.deepStrictEqual(rows.map(r => [r.card.name, r.copies, r.inDeck, r.score]),
      [['Good', 2, true, 60], ['Good', 1, false, 60], ['Bad', 1, true, 45]])
  })
  it('matches by name and subtitle, then by name alone, and leaves unknown cards unscored', () => {
    const rows = metaRows([{ name: 'Same Name', subtitle: 'Two' }, card('Unknown')], [], data)
    assert.deepStrictEqual(rows.map(r => [r.card.name, r.score]), [['Same Name', 55], ['Unknown', null]])
  })
})

describe('averages', () => {
  it('format average pools game-in-hand wins over games', () => {
    // 60% of 300 + 45% of 100 = 225 wins / 400 games
    assert.strictEqual(formatAverage([stats('A', 60, 300), stats('B', 45, 100)]), 56.25)
  })
  it('deck average counts copies and ignores the sideboard', () => {
    const rows = metaRows([card('Good'), card('Good'), card('Bad')], [card('Bad')], [stats('Good', 60, 300), stats('Bad', 45, 300)])
    assert.strictEqual(deckAverage(rows), (60 * 2 + 45) / 3)
  })
})

describe('sideboardUpgrades', () => {
  const data = [stats('Weak', 44, 300), stats('Okay', 52, 300), stats('Strong', 58, 300), stats('Thin', 70, MIN_META_SAMPLE - 1), stats('Splash', 66, 300)]
  const rows = metaRows([card('Weak'), card('Okay')], [card('Strong'), card('Thin'), card('Splash', ['Vigilance'])], data)
  const inAspect = (c: { aspects?: string[] | null }) => !c.aspects?.includes('Vigilance')

  it('pairs the best playable sideboard card with the weakest deck card', () => {
    const ups = sideboardUpgrades(rows, inAspect)
    assert.deepStrictEqual(ups.map(u => [u.out.card.name, u.in.card.name, u.gain]), [['Weak', 'Strong', 14]])
  })
  it('skips thin samples and cards that would add a penalty', () => {
    const names = sideboardUpgrades(rows, inAspect).map(u => u.in.card.name)
    assert.ok(!names.includes('Thin') && !names.includes('Splash'))
  })
})
