import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDeckGameplayMetrics,
  buildOpponentBreakdown,
} from './deckGameplayStats'

describe('buildDeckGameplayMetrics', () => {
  it('computes match record, game record, and result distribution', () => {
    const metrics = buildDeckGameplayMetrics([
      { result: 'win', gameResults: ['W', 'W'] },
      { result: 'win', gameResults: ['L', 'W', 'W'] },
      { result: 'loss', gameResults: ['W', 'L', 'L'] },
      { result: 'draw', gameResults: ['D'] },
    ])

    assert.equal(metrics.matchRecord.matches, 4)
    assert.equal(metrics.matchRecord.winRate, 50)
    assert.equal(metrics.gameRecord.wins, 5)
    assert.equal(metrics.gameRecord.losses, 3)
    assert.equal(metrics.gameRecord.draws, 1)
    assert.equal(metrics.distribution.find((bucket) => bucket.key === '2-0')?.count, 1)
    assert.equal(metrics.distribution.find((bucket) => bucket.key === '2-1')?.count, 1)
    assert.equal(metrics.distribution.find((bucket) => bucket.key === '1-2')?.count, 1)
    assert.equal(metrics.distribution.find((bucket) => bucket.key === 'draw')?.count, 1)
  })

  it('suppresses distribution charts below five matches and ignores pending rows', () => {
    const metrics = buildDeckGameplayMetrics([
      { result: 'win', gameResults: ['W'] },
      { result: 'pending', gameResults: [] },
    ])

    assert.equal(metrics.matchRecord.matches, 1)
    assert.equal(metrics.canShowDistributionChart, false)
    assert.equal(metrics.distributionMatches, 1)
  })

  it('handles zero games without NaN', () => {
    const metrics = buildDeckGameplayMetrics([])
    assert.equal(metrics.matchRecord.matches, 0)
    assert.equal(metrics.matchRecord.winRate, 0)
    assert.equal(metrics.gameRecord.winRate, 0)
  })

  it('excludes leader mirrors from match and game records', () => {
    const metrics = buildDeckGameplayMetrics([
      { result: 'win', gameResults: ['W', 'W'], leaderName: 'Sabine Wren', opponent: { leaderName: 'Sabine Wren' } },
      { result: 'loss', gameResults: ['L', 'W', 'L'], leaderName: 'Sabine Wren', opponent: { leaderName: 'Darth Vader' } },
    ])

    assert.equal(metrics.matchRecord.matches, 1)
    assert.equal(metrics.matchRecord.wins, 0)
    assert.equal(metrics.matchRecord.losses, 1)
    assert.equal(metrics.gameRecord.wins, 1)
    assert.equal(metrics.gameRecord.losses, 2)
    assert.equal(metrics.distribution.find((bucket) => bucket.key === '1-2')?.count, 1)
    assert.equal(metrics.distribution.find((bucket) => bucket.key === '2-0')?.count, 0)
  })
})

describe('buildOpponentBreakdown', () => {
  it('groups by opponent leader, base, and archetype with records', () => {
    const rows = [
      { result: 'win', opponent: { username: 'A', leaderName: 'Sabine', baseName: 'Tarkintown', archetype: 'Sabine Aggro' } },
      { result: 'loss', opponent: { username: 'A', leaderName: 'Sabine', baseName: 'Tarkintown', archetype: 'Sabine Aggro' } },
      { result: 'win', opponent: { username: 'B', leaderName: 'Vader', baseName: 'Command Center', archetype: 'Vader Control' } },
      { result: 'win', opponent: { username: 'B', leaderName: 'Vader', baseName: 'Command Center', archetype: 'Vader Control' } },
      { result: 'draw', opponent: { username: 'B', leaderName: 'Vader', baseName: 'Command Center', archetype: 'Vader Control' } },
      { result: 'loss', opponent: { username: 'B', leaderName: 'Vader', baseName: 'Command Center', archetype: 'Vader Control' } },
      { result: 'win', opponent: { username: 'B', leaderName: 'Vader', baseName: 'Command Center', archetype: 'Vader Control' } },
    ] as any

    const breakdown = buildOpponentBreakdown(rows)
    assert.equal(breakdown.length, 2)
    assert.equal(breakdown[0].leaderName, 'Vader')
    assert.equal(breakdown[0].matches, 5)
    assert.equal(breakdown[0].wins, 3)
    assert.equal(breakdown[0].winRate, 60)
    assert.equal(breakdown[0].sufficientData, true)
    assert.equal(breakdown[1].sufficientData, false)
  })

  it('buckets null opponents without crashing', () => {
    const breakdown = buildOpponentBreakdown([{ result: 'loss', opponent: null }] as any)
    assert.equal(breakdown.length, 1)
    assert.equal(breakdown[0].opponentName, 'Unknown opponent')
    assert.equal(breakdown[0].matches, 1)
  })

  it('excludes leader mirrors from matchup records', () => {
    const breakdown = buildOpponentBreakdown([
      { result: 'win', leaderName: 'Sabine Wren', opponent: { username: 'Mirror', leaderName: 'Sabine Wren', baseName: 'Tarkintown', archetype: 'Sabine Aggro' } },
      { result: 'loss', leaderName: 'Sabine Wren', opponent: { username: 'Control', leaderName: 'Darth Vader', baseName: 'Command Center', archetype: 'Vader Control' } },
    ] as any)

    assert.equal(breakdown.length, 1)
    assert.equal(breakdown[0].leaderName, 'Darth Vader')
    assert.equal(breakdown[0].matches, 1)
    assert.equal(breakdown[0].losses, 1)
  })
})
