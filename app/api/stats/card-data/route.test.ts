import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mapWayfinderRowsToCardDataStats } from './route'

describe('/api/stats/card-data Wayfinder mapping', () => {
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
})
