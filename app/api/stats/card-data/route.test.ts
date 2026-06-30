import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { enrichPayloadWithHyperspaceImages, mapWayfinderRowsToCardDataStats, shouldPreferWayfinderCardData } from './route'

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
    assert.equal(payload.cards[0].gradeBasis, 'GIH WR')
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
    assert.equal(leader.grade, null)
    assert.equal(leader.gradeBasis, 'Leader WR')
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
