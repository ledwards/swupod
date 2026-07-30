import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  PICK_GRADE_FULL_SEEN,
  PICK_GRADE_MIN_CARDS,
  PICK_GRADE_MIN_SEEN,
  computeBucketedCardPickGrades,
  computeCardPickGrades,
  computeLeaderPickGrades,
  pickGradeStatusLabel,
  pickIdentityKey,
} from './pickPreferenceGrades'
import type { PickPreferenceCardStat, PickPreferenceLeaderStat } from './pickPreferenceGrades'

const cardStat = (name: string, bt: number, aSeen = 400, extra: Partial<PickPreferenceCardStat> = {}): PickPreferenceCardStat => ({
  name,
  subtitle: '',
  rating: null,
  bt,
  aRate: null,
  aSeen,
  ...extra,
})

const leaderStat = (name: string, strength: number | null, seen = 2000): PickPreferenceLeaderStat => ({
  name,
  subtitle: 'Test Subtitle',
  strength,
  seen,
  picked: Math.round(seen / 2),
  pickRate: 0.5,
  apr: 2,
})

/** A spread of strengths wide enough that grading has real variance. */
const strengthLadder = (count: number): PickPreferenceCardStat[] =>
  Array.from({ length: count }, (_, i) => cardStat(`Card ${i}`, Math.exp((i - count / 2) / (count / 4))))

describe('pickIdentityKey', () => {
  it('matches the card-data loose key convention (lowercase name|subtitle)', () => {
    assert.equal(pickIdentityKey('Cad Bane', 'Still Faster than You'), 'cad bane|still faster than you')
    assert.equal(pickIdentityKey('Whistling Birds', null), 'whistling birds|')
    assert.equal(pickIdentityKey('  Vane ', ''), 'vane|')
  })
})

describe('computeLeaderPickGrades', () => {
  it('orders grades by Plackett-Luce strength, not win rate', () => {
    const leaders = [
      leaderStat('Dominant', 5.02),
      leaderStat('Strong', 1.91),
      leaderStat('Mid', 0.74),
      leaderStat('Low', 0.17),
      leaderStat('Lower', 0.07),
      leaderStat('Lowest', 0.03),
    ]
    const grades = computeLeaderPickGrades(leaders)
    const gradeOf = (name: string) => grades.get(pickIdentityKey(name, 'Test Subtitle'))
    const GRADE_RANK = ['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+']
    const rankOf = (name: string) => GRADE_RANK.indexOf(gradeOf(name)?.grade ?? '')
    assert.equal(gradeOf('Dominant')?.status, 'graded')
    assert.ok(rankOf('Dominant') > rankOf('Mid'), 'dominant leader must out-grade the mid leader')
    assert.ok(rankOf('Mid') > rankOf('Lowest'), 'mid leader must out-grade the lowest leader')
    assert.equal(gradeOf('Lowest')?.status, 'graded')
    // z-scores must be monotone in strength
    const zs = leaders.map((leader) => gradeOf(leader.name)?.zScore ?? NaN)
    for (let i = 1; i < zs.length; i++) assert.ok(zs[i - 1]! > zs[i]!, `z must decrease: ${zs.join(', ')}`)
  })

  it('refuses to grade a leader below the seen floor — no more A+ on one game', () => {
    const leaders = [
      ...['A', 'B', 'C', 'D', 'E', 'F'].map((name, i) => leaderStat(name, Math.exp(i - 3))),
      leaderStat('Luke Special', 10, 2), // seen twice, huge apparent strength
    ]
    const grades = computeLeaderPickGrades(leaders)
    const luke = grades.get(pickIdentityKey('Luke Special', 'Test Subtitle'))
    assert.equal(luke?.grade, null)
    assert.equal(luke?.status, 'sample-too-small')
  })

  it('flags leaders graded below the full floor as provisional', () => {
    const leaders = [
      ...['A', 'B', 'C', 'D', 'E', 'F'].map((name, i) => leaderStat(name, Math.exp(i - 3))),
      leaderStat('Thin', 1.5, PICK_GRADE_MIN_SEEN),
    ]
    const thin = computeLeaderPickGrades(leaders).get(pickIdentityKey('Thin', 'Test Subtitle'))
    assert.equal(thin?.status, 'graded')
    assert.equal(thin?.provisional, true)
    assert.ok(PICK_GRADE_MIN_SEEN < PICK_GRADE_FULL_SEEN)
  })

  it('does not grade leaders with missing or non-positive strength', () => {
    const leaders = [
      ...['A', 'B', 'C', 'D', 'E', 'F'].map((name, i) => leaderStat(name, Math.exp(i - 3))),
      leaderStat('Broken', null),
      leaderStat('Zeroed', 0),
    ]
    const grades = computeLeaderPickGrades(leaders)
    assert.equal(grades.get(pickIdentityKey('Broken', 'Test Subtitle'))?.grade, null)
    assert.equal(grades.get(pickIdentityKey('Zeroed', 'Test Subtitle'))?.grade, null)
  })
})

describe('computeCardPickGrades', () => {
  it('grades a full slice with the strongest cards in the A bands and weakest in F', () => {
    const cards = strengthLadder(60)
    const grades = computeCardPickGrades(cards)
    const top = grades.get(pickIdentityKey('Card 59', ''))
    const bottom = grades.get(pickIdentityKey('Card 0', ''))
    assert.equal(top?.status, 'graded')
    assert.ok(['A+', 'A', 'A-'].includes(top?.grade ?? ''), `top grade was ${top?.grade}`)
    assert.ok(['F', 'D-', 'D'].includes(bottom?.grade ?? ''), `bottom grade was ${bottom?.grade}`)
  })

  it('withholds grades when fewer than the minimum cards are eligible', () => {
    const cards = strengthLadder(PICK_GRADE_MIN_CARDS - 1)
    const grades = computeCardPickGrades(cards)
    for (const grade of grades.values()) assert.equal(grade.grade, null)
  })

  it('leaves under-sampled cards ungraded while grading the rest', () => {
    const cards = [...strengthLadder(40), cardStat('Fresh Card', 3, PICK_GRADE_MIN_SEEN - 1)]
    const grades = computeCardPickGrades(cards)
    const fresh = grades.get(pickIdentityKey('Fresh Card', ''))
    assert.equal(fresh?.grade, null)
    assert.equal(fresh?.status, 'sample-too-small')
    assert.equal(grades.get(pickIdentityKey('Card 20', ''))?.status, 'graded')
  })
})

describe('computeBucketedCardPickGrades', () => {
  it('grades each card against its own cost bucket', () => {
    // Two cost buckets with identical internal ladders: the best 2-drop and the
    // best 6-drop should earn the same grade even though every 6-drop has a
    // higher absolute strength.
    const cards: PickPreferenceCardStat[] = []
    const costByKey = new Map<string, number | null>()
    for (let i = 0; i < 15; i++) {
      const cheap = cardStat(`Cheap ${i}`, Math.exp(i / 5 - 3))
      const pricey = cardStat(`Pricey ${i}`, Math.exp(i / 5 + 1))
      cards.push(cheap, pricey)
      costByKey.set(pickIdentityKey(cheap.name, ''), 2)
      costByKey.set(pickIdentityKey(pricey.name, ''), 6)
    }
    const grades = computeBucketedCardPickGrades(cards, costByKey, 'cost')
    const bestCheap = grades.get(pickIdentityKey('Cheap 14', ''))
    const bestPricey = grades.get(pickIdentityKey('Pricey 14', ''))
    assert.equal(bestCheap?.status, 'graded')
    assert.equal(bestCheap?.grade, bestPricey?.grade)
    assert.equal(bestCheap?.bucketKey, '2')
    assert.equal(bestPricey?.bucketKey, '6')
  })

  it('reports bucket-too-small instead of grading against a tiny bucket mean', () => {
    const cards = [...strengthLadder(40), cardStat('Lone Seven Drop', 1.2)]
    const costByKey = new Map<string, number | null>()
    for (const card of cards) costByKey.set(pickIdentityKey(card.name, ''), 3)
    costByKey.set(pickIdentityKey('Lone Seven Drop', ''), 7)
    const grades = computeBucketedCardPickGrades(cards, costByKey, 'cost')
    const lone = grades.get(pickIdentityKey('Lone Seven Drop', ''))
    assert.equal(lone?.grade, null)
    assert.equal(lone?.status, 'bucket-too-small')
  })
})

describe('pickGradeStatusLabel', () => {
  it('describes every status in user-facing terms', () => {
    assert.equal(pickGradeStatusLabel('graded'), 'Graded')
    assert.equal(pickGradeStatusLabel('sample-too-small'), `Needs ${PICK_GRADE_MIN_SEEN}+ picks seen`)
    assert.equal(pickGradeStatusLabel('bucket-too-small'), 'Too few cards at this cost')
  })
})
