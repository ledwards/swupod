import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { enrichPayloadWithHyperspaceImages, mapWayfinderRowsToCardDataStats, shouldPreferWayfinderCardData, withBucketedCardGrades } from './route'

describe('/api/stats/card-data Wayfinder mapping', () => {
  it('keeps All formats on the local aggregate so leaders and bases remain available', () => {
    assert.equal(shouldPreferWayfinderCardData({
      format: 'all',
      source: 'online',
      tournamentOnly: false,
      topPlayersOnly: false,
      userId: null,
    }), false)
    assert.equal(shouldPreferWayfinderCardData({
      format: 'limited',
      source: 'online',
      tournamentOnly: false,
      topPlayersOnly: false,
      userId: null,
    }), true)
  })

  it('maps Wayfinder card stats rows into SWUPOD card-data rows with percent metrics', () => {
    const payload = mapWayfinderRowsToCardDataStats({
      setCode: 'ASH',
      format: 'all',
      rows: [
        {
          slug: 'rancor-keeper',
          cardUuid: 'card-uuid',
          name: 'Rancor Keeper',
          type: 'Unit',
          aspects: ['Command'],
          cost: 6,
          setCode: 'ASH',
          collectorNumber: 'ASH_296',
          rarity: 'Rare',
          imageUrl: 'https://example.test/rancor.png',
          deckCount: 6,
          totalDecks: 80,
          deckGames: 23,
          gpWins: 15,
          gpWr: 0.652173913,
          gihGames: 6,
          gihWr: 1,
          gnsGames: 17,
          gnsWr: 0.529411765,
          iih: 0.470588235,
          grade: 'A+',
          gradeMetricLabel: 'GIH WR',
          handMetricsStatus: 'available',
          sampleWarning: 'Provisional grade; Small grade sample',
        },
      ],
    })

    assert.equal(payload.source, 'online')
    assert.equal(payload.sourceDetail, 'wayfinder')
    assert.equal(payload.format, 'limited')
    assert.equal(payload.totalDecks, 80)
    assert.equal(payload.cards.length, 1)
    assert.equal(payload.cards[0].cardName, 'Rancor Keeper')
    assert.equal(payload.cards[0].gpWr, 65.2)
    assert.equal(payload.cards[0].gihWr, 100)
    assert.equal(payload.cards[0].gnsWr, 52.9)
    assert.equal(payload.cards[0].iih, 47.1)
    assert.equal(payload.cards[0].grade, 'A+')
    assert.equal(payload.cards[0].displayGrade, 'A+')
    assert.equal(payload.cards[0].gradeBasis, 'GIH WR')
    assert.equal(payload.cards[0].gradeStatus, 'provisional')
    assert.equal(payload.cards[0].gradePolicy, 'wayfinder-provisional')
  })

  it('keeps leader hand metrics null even if an upstream source sends them', () => {
    const payload = mapWayfinderRowsToCardDataStats({
      setCode: 'ASH',
      format: 'all',
      rows: [
        {
          slug: 'ahsoka-tano',
          name: 'Ahsoka Tano',
          type: 'Leader',
          deckGames: 12,
          gpWins: 8,
          gpWr: 0.666666667,
          ohGames: 12,
          ohWr: 0.666666667,
          gdGames: 12,
          gdWr: 0.666666667,
          gihGames: 12,
          gihWr: 0.666666667,
          gnsGames: 12,
          gnsWr: 0.666666667,
          iih: 0,
          playedRate: 1,
          resourcedWhenSeenRate: 0,
          playedWar: 0,
          grade: 'A',
          gradeMetricLabel: 'GIH WR',
        },
      ],
    })

    const leader = payload.cards[0]
    assert.equal(leader.isLeader, true)
    assert.equal(leader.gpWr, 66.7)
    assert.equal(leader.grade, 'A')
    assert.equal(leader.displayGrade, 'A')
    assert.equal(leader.gradeBasis, 'Leader WR')
    assert.equal(leader.gradePolicy, 'leader-win-rate')
    assert.equal(leader.ohWr, null)
    assert.equal(leader.gdWr, null)
    assert.equal(leader.gihWr, null)
    assert.equal(leader.gnsWr, null)
    assert.equal(leader.iih, null)
    assert.equal(leader.playedRate, null)
    assert.equal(leader.resourcedWhenSeen, null)
    assert.equal(leader.playedWar, null)
  })

  it('enriches stats rows with set-aware hyperspace card art', () => {
    const payload = {
      leaders: [
        {
          cardName: 'Saw Gerrera',
          subtitle: 'Bring Down the Empire',
          cardType: 'Leader',
          setCode: 'ASH',
          imageUrl: 'normal-leader-front.png',
          backImageUrl: 'normal-leader-back.png',
        },
      ],
      bases: [
        {
          cardName: "Daimyo's Palace",
          subtitle: null,
          cardType: 'Base',
          setCode: 'ASH',
          imageUrl: 'normal-base.png',
        },
      ],
      cards: [
        {
          cardName: 'Rancor Keeper',
          subtitle: null,
          cardType: 'Unit',
          setCode: 'ASH',
          imageUrl: 'normal-unit.png',
        },
      ],
    }

    const enriched = enrichPayloadWithHyperspaceImages(payload, [
      {
        name: 'Rancor Keeper',
        subtitle: null,
        type: 'Unit',
        set: 'LAW',
        variantType: 'Hyperspace',
        isHyperspace: true,
        imageUrl: 'law-hyperspace-unit.png',
        backImageUrl: null,
      },
      {
        name: 'Rancor Keeper',
        subtitle: null,
        type: 'Unit',
        set: 'ASH',
        variantType: 'Hyperspace Foil',
        isHyperspace: true,
        imageUrl: 'ash-hyperspace-foil-unit.png',
        backImageUrl: null,
      },
      {
        name: 'Rancor Keeper',
        subtitle: null,
        type: 'Unit',
        set: 'ASH',
        variantType: 'Hyperspace',
        isHyperspace: true,
        imageUrl: 'ash-hyperspace-unit.png',
        backImageUrl: null,
      },
      {
        name: 'Saw Gerrera',
        subtitle: 'Bring Down the Empire',
        type: 'Leader',
        set: 'ASH',
        variantType: 'Hyperspace',
        isHyperspace: true,
        imageUrl: 'hyperspace-leader-front.png',
        backImageUrl: 'hyperspace-leader-back.png',
      },
      {
        name: "Daimyo's Palace",
        subtitle: null,
        type: 'Base',
        set: 'ASH',
        variantType: 'Hyperspace',
        isHyperspace: true,
        imageUrl: 'hyperspace-base.png',
        backImageUrl: null,
      },
    ] as any)

    assert.equal(enriched.cards[0].hyperspaceImageUrl, 'ash-hyperspace-unit.png')
    assert.equal(enriched.leaders[0].hyperspaceBackImageUrl, 'hyperspace-leader-back.png')
    assert.equal(enriched.bases[0].hyperspaceImageUrl, 'hyperspace-base.png')
  })
})

describe('/api/stats/card-data bucketed grades', () => {
  // 30 cheap cards winning ~45%, 30 expensive ones winning ~55% — the cost
  // confound. Global grading buries the cheap half; per-cost grading must not.
  const payload = {
    cards: [
      ...Array.from({ length: 30 }, (_, i) => ({
        cardName: `Cheap ${i}`, subtitle: null, cardType: 'Unit', cost: 2,
        gihCount: 200, gihWins: 85 + i, gpCount: 200, gpWins: 85 + i,
        displayGrade: 'D', grade: 'D',
      })),
      ...Array.from({ length: 30 }, (_, i) => ({
        cardName: `Pricey ${i}`, subtitle: null, cardType: 'Unit', cost: 5,
        gihCount: 200, gihWins: 105 + i, gpCount: 200, gpWins: 105 + i,
        displayGrade: 'A', grade: 'A',
      })),
      { cardName: 'A Leader', subtitle: null, cardType: 'Leader', isLeader: true, cost: null,
        gihCount: null, gihWins: null, gpCount: 200, gpWins: 120, displayGrade: 'A+', grade: 'A+' },
    ],
  }

  it('SPEC: leaves the existing global grade untouched', () => {
    const result = withBucketedCardGrades(payload)
    assert.equal(result.cards[0]!.displayGrade, 'D')
    assert.equal(result.cards[30]!.displayGrade, 'A')
  })

  it('SPEC: grades the best cheap card the same as the best expensive card', () => {
    const result = withBucketedCardGrades(payload)
    const bestCheap = result.cards.find((c: any) => c.cardName === 'Cheap 29')
    const bestPricey = result.cards.find((c: any) => c.cardName === 'Pricey 29')

    assert.equal(bestCheap.gradesByScheme.cost.grade, bestPricey.gradesByScheme.cost.grade)
    assert.equal(bestCheap.gradesByScheme.cost.bucketLabel, '2-Drop')
    assert.equal(bestPricey.gradesByScheme.cost.bucketLabel, '5-Drop')
  })

  it('SPEC: exposes both bucketed schemes and reports the basis used', () => {
    const result = withBucketedCardGrades(payload)

    assert.equal(result.bucketedGradeBasis, 'GIH WR')
    assert.equal(result.cards[0]!.gradesByScheme['curve-slot'].bucketLabel, 'Turn 1 Plays (1-2)')
    assert.equal(result.cards[30]!.gradesByScheme['curve-slot'].bucketLabel, 'Turn 4 Plays (5)')
  })

  it('SPEC: leaves leaders out of cost bucketing entirely', () => {
    const result = withBucketedCardGrades(payload)
    const leader = result.cards.find((c: any) => c.isLeader)

    assert.equal(leader.gradesByScheme, undefined)
    assert.equal(leader.displayGrade, 'A+')
  })

  it('SPEC: falls back to GP when no replay metrics are present', () => {
    const gpOnly = { cards: payload.cards.map((c: any) => ({ ...c, gihCount: null, gihWins: null })) }
    assert.equal(withBucketedCardGrades(gpOnly).bucketedGradeBasis, 'GP WR')
  })

  it('SPEC: small-sample bucketed grades are labelled Provisional', () => {
    // 30 cards at 20 games in hand: above the provisional floor, below the full one.
    const thin = {
      cards: Array.from({ length: 30 }, (_, i) => ({
        cardName: `Thin ${i}`, subtitle: null, cardType: 'Unit', cost: 2,
        gihCount: 20, gihWins: 8 + i * 0.1, gpCount: 20, gpWins: 8 + i * 0.1,
        displayGrade: 'C', grade: 'C',
      })),
    }
    const result = withBucketedCardGrades(thin)
    const cost = result.cards[0]!.gradesByScheme.cost

    assert.equal(cost.provisional, true)
    assert.equal(cost.statusLabel, 'Provisional')
    assert.notEqual(cost.grade, null)
  })

  it('SPEC: cards below the provisional floor are still refused a grade', () => {
    const tiny = {
      cards: Array.from({ length: 30 }, (_, i) => ({
        cardName: `Tiny ${i}`, subtitle: null, cardType: 'Unit', cost: 2,
        gihCount: 3, gihWins: 1, gpCount: 3, gpWins: 1,
        displayGrade: 'C', grade: 'C',
      })),
    }
    const cost = withBucketedCardGrades(tiny).cards[0]!.gradesByScheme.cost

    assert.equal(cost.grade, null)
    assert.equal(cost.status, 'sample-too-small')
  })

  it('SPEC: an empty payload is returned untouched', () => {
    assert.deepEqual(withBucketedCardGrades({ cards: [] }), { cards: [] })
  })
})
