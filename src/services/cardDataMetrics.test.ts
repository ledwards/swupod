import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  CARD_GRADE_BUCKET_SCHEMES,
  bucketForScheme,
  computeBucketedCardGrades,
  computeCardGrades,
  computeCardMetricRates,
  computeGnsCopies,
  gradeFromZScore,
} from './cardDataMetrics'

describe('card data metrics', () => {
  it('computes GNS from deck copies minus opener, later draws, and tutored seen copies', () => {
    assert.equal(computeGnsCopies({ deckCopies: 3, openerCopies: 1, drawnLaterCopies: 1 }), 1)
    assert.equal(computeGnsCopies({ deckCopies: 2, openerCopies: 1, drawnLaterCopies: 1, tutoredSeenCopies: 1 }), 0)
    assert.equal(computeGnsCopies({ deckCopies: 1, openerCopies: 0, drawnLaterCopies: 0 }), 1)
  })

  it('copy-weights GP, OH, GD, GIH, GNS, IIH, played rate, and resource rate', () => {
    const metrics = computeCardMetricRates([
      {
        deckCopies: 2,
        openerCopies: 1,
        drawnLaterCopies: 1,
        playedCopiesFromSeenHand: 1,
        resourcedCopiesFromSeenHand: 1,
        win: 1,
      },
      {
        deckCopies: 2,
        openerCopies: 0,
        drawnLaterCopies: 0,
        playedCopiesFromSeenHand: 0,
        resourcedCopiesFromSeenHand: 0,
        win: 0,
      },
    ], { iihMinDenominator: 1 })

    assert.equal(metrics.gpCount, 4)
    assert.equal(metrics.gpWins, 2)
    assert.equal(metrics.gpWr, 0.5)
    assert.equal(metrics.ohCount, 1)
    assert.equal(metrics.ohWr, 1)
    assert.equal(metrics.gdCount, 1)
    assert.equal(metrics.gdWr, 1)
    assert.equal(metrics.gihCount, 2)
    assert.equal(metrics.gihWr, 1)
    assert.equal(metrics.gnsCount, 2)
    assert.equal(metrics.gnsWr, 0)
    assert.equal(metrics.iih, 100)
    assert.equal(metrics.playedRate, 0.5)
    assert.equal(metrics.resourcedWhenSeen, 0.5)
  })

  it('marks played and resource rates unavailable when copy-safe provenance is missing', () => {
    const metrics = computeCardMetricRates([
      { deckCopies: 1, openerCopies: 1, drawnLaterCopies: 0, playedCopiesFromSeenHand: null, win: 1 },
    ])

    assert.equal(metrics.playedRate, null)
    assert.equal(metrics.resourcedWhenSeen, null)
  })

  it('maps z-scores into the 17Lands-style grade bands', () => {
    assert.equal(gradeFromZScore(2.2), 'A+')
    assert.equal(gradeFromZScore(1.9), 'A')
    assert.equal(gradeFromZScore(0.2), 'C+')
    assert.equal(gradeFromZScore(0), 'C')
    assert.equal(gradeFromZScore(-2), 'F')
  })

  it('grades a sufficiently large 17Lands-style slice', () => {
    const inputs = Array.from({ length: 25 }, (_, index) => ({
      key: `card-${index}`,
      wins: 25 + index,
      denominator: 100,
    }))
    const grades = computeCardGrades(inputs)

    assert.equal(grades.length, 25)
    assert.equal(grades.every((grade) => grade.status === 'graded'), true)
    assert.notEqual(grades[24].grade, null)
    assert.equal(computeCardGrades(inputs.slice(0, 4)).every((grade) => grade.status === 'slice-too-small'), true)
  })
})

// Buckets mirror the ASH draft guide's own groupings:
//   "Cards are ranked against other cards of the same cost. S-Tier 2 drops are
//    not necessarily as strong as S-Tier 5 drops."
// The `curve-slot` scheme reproduces the guide's turn headings, which merge
// 1- and 2-drops into "Turn 1 Plays" and cap the curve at 7+.
describe('card grade bucket schemes', () => {
  it('SPEC: exposes global, cost, and curve-slot schemes', () => {
    assert.deepEqual([...CARD_GRADE_BUCKET_SCHEMES], ['global', 'cost', 'curve-slot'])
  })

  it('SPEC: cost scheme gives every cost its own bucket, capped at 7+', () => {
    assert.equal(bucketForScheme('cost', 1)?.key, '1')
    assert.equal(bucketForScheme('cost', 2)?.key, '2')
    assert.equal(bucketForScheme('cost', 6)?.key, '6')
    assert.equal(bucketForScheme('cost', 7)?.key, '7+')
    assert.equal(bucketForScheme('cost', 9)?.key, '7+')
    assert.equal(bucketForScheme('cost', 2)?.label, '2-Drop')
    assert.equal(bucketForScheme('cost', 7)?.label, '7+ Drop')
  })

  it('SPEC: curve-slot merges 1- and 2-drops into Turn 1 Plays', () => {
    assert.equal(bucketForScheme('curve-slot', 0)?.key, 'turn-1')
    assert.equal(bucketForScheme('curve-slot', 1)?.key, 'turn-1')
    assert.equal(bucketForScheme('curve-slot', 2)?.key, 'turn-1')
    assert.equal(bucketForScheme('curve-slot', 3)?.key, 'turn-2')
    assert.equal(bucketForScheme('curve-slot', 7)?.key, 'turn-6')
    assert.equal(bucketForScheme('curve-slot', 1)?.label, 'Turn 1 Plays (1-2)')
  })

  it('SPEC: uncosted cards belong to no bucket', () => {
    assert.equal(bucketForScheme('cost', null), null)
    assert.equal(bucketForScheme('curve-slot', null), null)
    assert.equal(bucketForScheme('global', 3), null)
  })
})

describe('bucketed card grades', () => {
  // 40 cards: 20 cheap ones that win 45% of the time, 20 expensive ones that
  // win 55%. Globally the cheap cards are all below average and the expensive
  // ones all above — the exact cost confound the guide warns about.
  const makeSplitSlice = () => [
    ...Array.from({ length: 20 }, (_, i) => ({
      key: `cheap-${i}`,
      cost: 2,
      denominator: 100,
      wins: 40 + i * 0.5,
    })),
    ...Array.from({ length: 20 }, (_, i) => ({
      key: `pricey-${i}`,
      cost: 5,
      denominator: 100,
      wins: 50 + i * 0.5,
    })),
  ]

  it('SPEC: global grading buries every cheap card beneath every expensive one', () => {
    const grades = computeBucketedCardGrades(makeSplitSlice(), 'global')
    const worstPricey = Math.min(...grades.filter(g => g.key.startsWith('pricey')).map(g => g.zScore!))
    const bestCheap = Math.max(...grades.filter(g => g.key.startsWith('cheap')).map(g => g.zScore!))

    assert.ok(worstPricey > bestCheap, 'global grading should rank all 5-drops above all 2-drops')
    assert.equal(grades.every(g => g.bucketKey === null), true)
  })

  it('SPEC: cost grading judges each card against its own cost bucket', () => {
    const grades = computeBucketedCardGrades(makeSplitSlice(), 'cost')
    const byKey = new Map(grades.map(g => [g.key, g]))

    // The best 2-drop and the best 5-drop are equally far above their own par,
    // so they must receive the same grade despite a 10pp win-rate gap.
    assert.equal(byKey.get('cheap-19')!.grade, byKey.get('pricey-19')!.grade)
    assert.equal(byKey.get('cheap-0')!.grade, byKey.get('pricey-0')!.grade)
    assert.equal(byKey.get('cheap-19')!.bucketKey, '2')
    assert.equal(byKey.get('pricey-19')!.bucketKey, '5')
    assert.equal(byKey.get('cheap-19')!.bucketLabel, '2-Drop')
    assert.equal(grades.every(g => g.status === 'graded'), true)
  })

  it('SPEC: a bucket spans the full grade range instead of collapsing to one band', () => {
    const grades = computeBucketedCardGrades(makeSplitSlice(), 'cost')
    const cheapGrades = new Set(grades.filter(g => g.key.startsWith('cheap')).map(g => g.grade))

    assert.ok(cheapGrades.size >= 3, `2-drops should spread across bands, got ${[...cheapGrades].join(',')}`)
  })

  it('SPEC: pooled SD keeps grades comparable across buckets of different size', () => {
    // A 6-card bucket is far too small to estimate its own spread. Pooling the
    // within-bucket SD across all buckets lets it grade anyway.
    const inputs = [
      ...Array.from({ length: 30 }, (_, i) => ({ key: `big-${i}`, cost: 2, denominator: 100, wins: 40 + i })),
      ...Array.from({ length: 6 }, (_, i) => ({ key: `small-${i}`, cost: 6, denominator: 100, wins: 50 + i })),
    ]
    const grades = computeBucketedCardGrades(inputs, 'cost')

    assert.equal(grades.filter(g => g.key.startsWith('small')).every(g => g.status === 'graded'), true)
  })

  it('SPEC: buckets below the minimum card count are ungraded, not guessed', () => {
    const inputs = [
      ...Array.from({ length: 30 }, (_, i) => ({ key: `big-${i}`, cost: 2, denominator: 100, wins: 40 + i })),
      { key: 'lonely', cost: 6, denominator: 100, wins: 70 },
    ]
    const grades = computeBucketedCardGrades(inputs, 'cost', { minBucketCards: 5 })
    const lonely = grades.find(g => g.key === 'lonely')!

    assert.equal(lonely.grade, null)
    assert.equal(lonely.status, 'bucket-too-small')
  })

  it('SPEC: uncosted cards are ungraded under a bucketed scheme', () => {
    const inputs = [
      ...Array.from({ length: 30 }, (_, i) => ({ key: `c-${i}`, cost: 2, denominator: 100, wins: 40 + i })),
      { key: 'leader', cost: null, denominator: 100, wins: 60 },
    ]
    const grades = computeBucketedCardGrades(inputs, 'cost')
    const leader = grades.find(g => g.key === 'leader')!

    assert.equal(leader.grade, null)
    assert.equal(leader.bucketKey, null)
  })

  it('SPEC: the existing per-card sample floor still applies inside buckets', () => {
    const inputs = [
      ...Array.from({ length: 30 }, (_, i) => ({ key: `c-${i}`, cost: 2, denominator: 100, wins: 40 + i })),
      { key: 'thin', cost: 2, denominator: 10, wins: 8 },
    ]
    const grades = computeBucketedCardGrades(inputs, 'cost')

    assert.equal(grades.find(g => g.key === 'thin')!.status, 'sample-too-small')
  })

  // Provisional grading exists so the bucketed lenses have comparable coverage
  // to the global column, which grades on very small samples. Anything graded
  // below the full floor must be flagged so the UI can say so.
  it('SPEC: grades between the provisional and full floors are marked provisional', () => {
    const inputs = Array.from({ length: 30 }, (_, i) => ({
      key: `c-${i}`,
      cost: 2,
      denominator: 20,
      wins: 8 + i * 0.1,
    }))
    const grades = computeBucketedCardGrades(inputs, 'cost', { minDenominator: 15 })

    assert.equal(grades.every(g => g.status === 'graded'), true)
    assert.equal(grades.every(g => g.provisional === true), true)
  })

  it('SPEC: grades at or above the full floor are not provisional', () => {
    const inputs = Array.from({ length: 30 }, (_, i) => ({
      key: `c-${i}`,
      cost: 2,
      denominator: 100,
      wins: 40 + i,
    }))
    const grades = computeBucketedCardGrades(inputs, 'cost', { minDenominator: 15 })

    assert.equal(grades.every(g => g.provisional === false), true)
  })

  it('SPEC: cards below the provisional floor stay ungraded', () => {
    const inputs = [
      ...Array.from({ length: 30 }, (_, i) => ({ key: `c-${i}`, cost: 2, denominator: 20, wins: 8 + i * 0.1 })),
      { key: 'one-game', cost: 2, denominator: 1, wins: 1 },
    ]
    const grades = computeBucketedCardGrades(inputs, 'cost', { minDenominator: 15 })

    assert.equal(grades.find(g => g.key === 'one-game')!.grade, null)
    assert.equal(grades.find(g => g.key === 'one-game')!.status, 'sample-too-small')
  })

  it('SPEC: a slice too small to grade globally stays ungraded when bucketed', () => {
    const inputs = Array.from({ length: 4 }, (_, i) => ({ key: `c-${i}`, cost: 2, denominator: 100, wins: 50 }))

    assert.equal(computeBucketedCardGrades(inputs, 'cost').every(g => g.status === 'slice-too-small'), true)
  })
})
