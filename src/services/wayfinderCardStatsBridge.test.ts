import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  fetchWayfinderReplayCardStats,
  mapWayfinderCardStatsRow,
  shouldFetchWayfinderReplayCardStats,
  type WayfinderCardStatsRow,
} from './wayfinderCardStatsBridge'

const rancorKeeper: WayfinderCardStatsRow = {
  slug: 'rancor-keeper',
  cardUuid: '3f8bd594-55d9-4573-9a38-be8352f7e106',
  name: 'Rancor Keeper',
  subtitle: null,
  type: 'Unit',
  aspects: ['Command'],
  cost: 3,
  setCode: 'ASH',
  rarity: 'Common',
  deckCount: 12,
  totalDecks: 66,
  deckGames: 23,
  gpWins: 15,
  gpWr: 15 / 23,
  ohGames: 1,
  ohWr: 1,
  gdGames: 5,
  gdWr: 1,
  gihGames: 6,
  gihWr: 1,
  gnsGames: 15,
  gnsWr: 0.6,
  iih: 0.4,
  playedRate: 1 / 6,
  resourcedWhenSeenRate: 5 / 6,
  playedWar: 1 / 3,
  grade: 'A+',
  gradeMetricLabel: 'GIH WR',
  gradeBasis: 'replay',
  handMetricsStatus: 'available',
  sampleWarning: 'Provisional grade; Small deck-game sample',
}

describe('wayfinder card stats bridge', () => {
  it('hydrates only global online-capable card stats slices', () => {
    assert.equal(shouldFetchWayfinderReplayCardStats({ setCode: 'ASH', source: 'online' }), true)
    assert.equal(shouldFetchWayfinderReplayCardStats({ setCode: 'ASH', source: 'all' }), true)
    assert.equal(shouldFetchWayfinderReplayCardStats({ setCode: 'ASH', source: 'in-person' }), false)
    assert.equal(shouldFetchWayfinderReplayCardStats({ setCode: 'ASH', userId: 'user-1' }), false)
    assert.equal(shouldFetchWayfinderReplayCardStats({ setCode: 'ASH', tournamentOnly: true }), false)
    assert.equal(shouldFetchWayfinderReplayCardStats({ setCode: 'ASH', topPlayersOnly: true }), false)
  })

  it('maps Wayfinder ratios into SWUPOD percentage-shaped rows', () => {
    const row = mapWayfinderCardStatsRow(rancorKeeper)

    assert.equal(row.cardName, 'Rancor Keeper')
    assert.equal(row.grade, 'A+')
    assert.equal(row.gradeBasis, 'GIH WR')
    assert.equal(row.gpCount, 23)
    assert.equal(row.gpWins, 15)
    assert.equal(row.gpWr, 65.2)
    assert.equal(row.gihCount, 6)
    assert.equal(row.gihWr, 100)
    assert.equal(row.gnsCount, 15)
    assert.equal(row.gnsWr, 60)
    assert.equal(row.iih, 0.4)
    assert.equal(row.playedRate, 16.7)
    assert.equal(row.resourcedWhenSeen, 83.3)
    assert.equal(row.playedWar, 1 / 3)
  })

  it('fetches and maps the Wayfinder table envelope', async () => {
    const seenUrls: string[] = []
    const result = await fetchWayfinderReplayCardStats(
      { setCode: 'ASH', since: '2026-03-20', until: '2026-06-27', format: 'draft', source: 'online' },
      (async (url: RequestInfo | URL) => {
        seenUrls.push(String(url))
        return new Response(JSON.stringify({ success: true, data: { rows: [rancorKeeper], total: 1, grandTotal: 1 } }), { status: 200 })
      }) as typeof fetch,
    )

    assert.ok(result)
    assert.equal(result.rows.length, 1)
    assert.equal(result.totalDecks, 66)
    assert.equal(result.replayMetricsStatus, 'available')
    assert.equal(result.gradeBasis, 'GIH WR')
    assert.match(seenUrls[0], /era=ASH/)
    assert.match(seenUrls[0], /format=limited/)
    assert.match(seenUrls[0], /sources=karabast%2Cptp/)
    assert.match(seenUrls[0], /limit=all/)
  })
})
