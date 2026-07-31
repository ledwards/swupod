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

describe('/api/stats/card-data pick-preference grades', async () => {
  const { withPickPreferenceGrades } = await import('./route')

  const meta = (name, subtitle, overrides = {}) => ({
    id: `${name}-id`, cardId: `ASH_${name.replace(/\s+/g, '')}`, number: '001',
    name, subtitle, set: 'ASH', rarity: 'Common', type: 'Unit', aspects: ['Command'],
    cost: 3, variantType: 'Normal', isLeader: false, isBase: false,
    imageUrl: `https://img.test/${name}.png`, backImageUrl: null,
    ...overrides,
  })

  // 30 graded cards on a strength ladder + one thin card below the seen floor.
  const statCards = Array.from({ length: 30 }, (_, i) => ({
    name: `Pick Card ${i}`, subtitle: '', rarity: 'Common',
    rating: Math.round((100 * i) / 29), bt: Number(Math.exp((i - 15) / 7).toFixed(4)),
    aRate: 0.5, aSeen: 400, seen: 900, pickRate: 0.3, ata: 5,
  }))
  const statLeaders = [
    { name: 'Dominant Leader', subtitle: 'One', rarity: 'Common', strength: 5.02, seen: 2201, picked: 1725, pickRate: 0.78, apr: 1.28 },
    { name: 'Strong Leader', subtitle: 'Two', rarity: 'Common', strength: 1.91, seen: 2577, picked: 1602, pickRate: 0.62, apr: 1.52 },
    { name: 'Mid Leader', subtitle: 'Three', rarity: 'Common', strength: 0.74, seen: 2939, picked: 1314, pickRate: 0.45, apr: 1.93 },
    { name: 'Low Leader', subtitle: 'Four', rarity: 'Rare', strength: 0.17, seen: 3471, picked: 758, pickRate: 0.22, apr: 2.49 },
    { name: 'Lower Leader', subtitle: 'Five', rarity: 'Rare', strength: 0.07, seen: 648, picked: 73, pickRate: 0.11, apr: 2.69 },
    { name: 'Floor Leader', subtitle: 'Six', rarity: 'Rare', strength: 0.03, seen: 680, picked: 44, pickRate: 0.06, apr: 2.83 },
    { name: 'Special Leader', subtitle: 'Ultra Rare', rarity: 'Special', strength: 1.96, seen: 2, picked: 2, pickRate: 1, apr: null },
  ]
  const stats = { set: 'ASH', minSeen: 20, contests: 100000, leaderContests: 5000, generatedAt: '2026-07-30', cards: statCards, leaders: statLeaders }

  const allCards = [
    ...statCards.map((card) => meta(card.name, null)),
    ...statLeaders.map((leader) => meta(leader.name, leader.subtitle, { type: 'Leader', isLeader: true, cost: 0 })),
  ]

  const leaderRow = (name, subtitle, grade, gpWr, gpCount) => ({
    cardName: name, subtitle, cardType: 'Leader', isLeader: true, isBase: false, rarity: 'Common',
    aspects: ['Command'], cost: null, grade, displayGrade: grade, gradeBasis: 'Leader WR',
    gradeStatus: 'graded', gradeStatusLabel: 'Graded', gradePolicy: 'leader-win-rate',
    deckCount: 5, rawCopies: 5, gpCount, gpWins: Math.round((gpWr / 100) * gpCount), gpWr,
  })

  it('SPEC: sets without pick data are untouched', () => {
    const payload = { setCode: 'SOR', leaders: [leaderRow('Any', null, 'A+', 71.4, 7)], cards: [] }
    assert.deepEqual(withPickPreferenceGrades(payload, allCards, null), payload)
  })

  it('SPEC: a v1 stats file without strengths leaves win-rate grades alone', () => {
    const v1 = { set: 'ASH', minSeen: 20, cards: [{ name: 'Pick Card 1', subtitle: '', rating: 90, aRate: 0.9, aSeen: 400 }] }
    const payload = { setCode: 'ASH', leaders: [leaderRow('Dominant Leader', 'One', 'B+', 58.8, 68)], cards: [] }
    const result = withPickPreferenceGrades(payload, allCards, v1)
    assert.equal(result.leaders[0].grade, 'B+')
    assert.equal(result.leaders[0].gradePolicy, 'leader-win-rate')
  })

  it('SPEC: leader tiers come from Plackett-Luce strength, not win rate', () => {
    const payload = {
      setCode: 'ASH',
      leaders: [
        // Win-rate order says Low > Dominant (the prod bug this switch fixes).
        leaderRow('Low Leader', 'Four', 'A+', 71.4, 7),
        leaderRow('Dominant Leader', 'One', 'B+', 58.8, 68),
      ],
      cards: [],
    }
    const result = withPickPreferenceGrades(payload, allCards, stats)
    const byName = new Map(result.leaders.map((row) => [row.cardName, row]))
    const gradeRank = (g) => ['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+'].indexOf(g)
    assert.ok(
      gradeRank(byName.get('Dominant Leader').displayGrade) > gradeRank(byName.get('Low Leader').displayGrade),
      `expected Dominant > Low, got ${byName.get('Dominant Leader').displayGrade} vs ${byName.get('Low Leader').displayGrade}`,
    )
    assert.equal(byName.get('Dominant Leader').gradePolicy, 'leader-pick-preference-pl')
    assert.equal(byName.get('Dominant Leader').gradeBasis, 'Leader Pick Preference')
    // Win-rate metrics survive as metrics.
    assert.equal(byName.get('Dominant Leader').gpWr, 58.8)
    assert.equal(byName.get('Dominant Leader').pickRate, 78)
    assert.equal(byName.get('Dominant Leader').ata, 1.28)
  })

  it('SPEC: an ultra-rare leader below the seen floor is ungraded, never A+ on two sightings', () => {
    const payload = { setCode: 'ASH', leaders: [leaderRow('Special Leader', 'Ultra Rare', 'A+', 100, 2)], cards: [] }
    const result = withPickPreferenceGrades(payload, allCards, stats)
    const special = result.leaders.find((row) => row.cardName === 'Special Leader')
    assert.equal(special.displayGrade, null)
    assert.equal(special.gradeStatus, 'sample-too-small')
  })

  it('SPEC: leaders missing from the slice are appended so the tier list is complete', () => {
    const payload = { setCode: 'ASH', leaders: [leaderRow('Dominant Leader', 'One', 'B+', 58.8, 68)], cards: [] }
    const result = withPickPreferenceGrades(payload, allCards, stats)
    assert.equal(result.leaders.length, statLeaders.length)
    const synthetic = result.leaders.find((row) => row.cardName === 'Mid Leader')
    assert.equal(synthetic.gpCount, 0)
    assert.equal(synthetic.gpWr, null)
    assert.notEqual(synthetic.displayGrade, null)
    assert.equal(synthetic.imageUrl, 'https://img.test/Mid Leader.png')
  })

  it('SPEC: card tiers come from Bradley-Terry strengths with bucketed lenses attached', () => {
    const cardRow = (name) => ({
      cardName: name, subtitle: null, cardType: 'Unit', isLeader: false, isBase: false,
      rarity: 'Common', aspects: ['Command'], cost: 3, grade: 'F', displayGrade: 'F',
      gradeStatus: 'graded', gradeStatusLabel: 'Graded', gradePolicy: 'wayfinder',
      deckCount: 3, rawCopies: 3, gpCount: 12, gpWins: 3, gpWr: 25,
      gradesByScheme: { cost: { grade: 'F', status: 'graded', statusLabel: 'Graded', bucketKey: '3', bucketLabel: '3-Drop' } },
    })
    const payload = { setCode: 'ASH', leaders: [], cards: [cardRow('Pick Card 29'), cardRow('Pick Card 0')] }
    const result = withPickPreferenceGrades(payload, allCards, stats)
    const best = result.cards.find((row) => row.cardName === 'Pick Card 29')
    const worst = result.cards.find((row) => row.cardName === 'Pick Card 0')
    assert.ok(['A+', 'A', 'A-'].includes(best.displayGrade), `best got ${best.displayGrade}`)
    assert.ok(['F', 'D-'].includes(worst.displayGrade), `worst got ${worst.displayGrade}`)
    assert.equal(best.gradePolicy, 'pick-preference-bt')
    assert.equal(best.gradesByScheme.cost.bucketKey, '3')
    // The whole graded set is appended, so the tier list is complete.
    assert.equal(result.cards.length, statCards.length)
    assert.equal(result.gradeMethodology, 'pick-preference')
    assert.equal(result.gradeBasis, 'Pick Preference')
  })

  it('SPEC: a slice card with no pick data is ungraded rather than falling back to win rate', () => {
    const stranger = {
      cardName: 'Unknown Card', subtitle: null, cardType: 'Unit', isLeader: false, isBase: false,
      rarity: 'Common', aspects: [], cost: 2, grade: 'A+', displayGrade: 'A+',
      gradeStatus: 'graded', gradeStatusLabel: 'Graded', gradePolicy: 'wayfinder',
      deckCount: 1, rawCopies: 1, gpCount: 4, gpWins: 4, gpWr: 100,
      gradesByScheme: { cost: { grade: 'A+', status: 'graded', statusLabel: 'Graded', bucketKey: '2', bucketLabel: '2-Drop' } },
    }
    const result = withPickPreferenceGrades({ setCode: 'ASH', leaders: [], cards: [stranger] }, allCards, stats)
    const row = result.cards.find((candidate) => candidate.cardName === 'Unknown Card')
    assert.equal(row.displayGrade, null)
    assert.equal(row.gradeStatus, 'sample-too-small')
    assert.equal(row.gradesByScheme.cost, undefined)
  })
})
