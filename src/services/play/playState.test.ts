import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildLocalReplayUrl,
  buildLocalRuntimeUrl,
  oppositeSeat,
  resultFromReporterPerspective,
  seatForUser,
  summarizeDeckBuilderState,
  winnerUserIdForResult,
} from './playState'

const readyState = {
  activeLeader: 'leader-1',
  activeBase: 'base-1',
  poolName: 'Leia Blue Draft',
  cardPositions: {
    'leader-1': { section: 'leader', card: { name: 'Leia Organa', isLeader: true } },
    'base-1': { section: 'base', card: { name: 'Echo Base', isBase: true } },
    ...Object.fromEntries(
      Array.from({ length: 30 }, (_, index) => [
        `card-${index + 1}`,
        { section: 'deck', card: { name: `Deck Card ${index + 1}` } },
      ])
    ),
    sideboard: { section: 'sideboard', card: { name: 'Sideboard Card' } },
  },
}

describe('PTP play state helpers', () => {
  it('summarizes built limited decks and blocks incomplete decks', () => {
    const ready = summarizeDeckBuilderState({
      shareId: 'abc123',
      setCode: 'SEC',
      poolType: 'draft',
      deckBuilderState: readyState,
    })

    assert.equal(ready.name, 'Leia Blue Draft')
    assert.equal(ready.leaderName, 'Leia Organa')
    assert.equal(ready.baseName, 'Echo Base')
    assert.equal(ready.mainDeckCount, 30)
    assert.equal(ready.ready, true)
    assert.equal(ready.blocker, null)

    const missingBase = summarizeDeckBuilderState({
      shareId: 'abc123',
      setCode: 'SEC',
      poolType: 'sealed',
      deckBuilderState: { ...readyState, activeBase: null },
    })

    assert.equal(missingBase.ready, false)
    assert.match(missingBase.blocker ?? '', /Choose a base/)
  })

  it('maps reported results from the reporting seat perspective', () => {
    assert.equal(resultFromReporterPerspective('win', 'player1'), 'player1')
    assert.equal(resultFromReporterPerspective('loss', 'player1'), 'player2')
    assert.equal(resultFromReporterPerspective('win', 'player2'), 'player2')
    assert.equal(resultFromReporterPerspective('loss', 'player2'), 'player1')
    assert.equal(resultFromReporterPerspective('draw', 'player2'), 'draw')
  })

  it('resolves seats, winners, and local runtime URLs', () => {
    const match = { player1UserId: 'u1', player2UserId: 'u2' }

    assert.equal(seatForUser(match, 'u1'), 'player1')
    assert.equal(seatForUser(match, 'u2'), 'player2')
    assert.equal(seatForUser(match, 'u3'), null)
    assert.equal(oppositeSeat('player1'), 'player2')
    assert.equal(winnerUserIdForResult('player2', match), 'u2')
    assert.equal(winnerUserIdForResult('draw', match), null)
    assert.equal(buildLocalRuntimeUrl('match id', 'seat token'), '/play/runtime/match%20id?seatToken=seat%20token')
    assert.equal(buildLocalReplayUrl('match id'), '/play/runtime/match%20id/replay')
  })
})
