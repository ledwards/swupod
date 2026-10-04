import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cardQualityScore, leaderPreferenceScore } from './activeRatingLookup'

describe('active limited rating precedence', () => {
  it('lets a published card rating beat a better-looking live pick position', () => {
    const score = cardQualityScore({
      activeScore: 12,
      liveAvgPickPosition: 1,
      nameRanking: 99,
      rarityScore: 80,
    })
    assert.equal(score, 12)
  })

  it('falls back to the name ranking when no active rating is published', () => {
    const score = cardQualityScore({
      activeScore: null,
      liveAvgPickPosition: null,
      nameRanking: 64,
      rarityScore: 15,
    })
    assert.equal(score, 64)
  })

  it('uses live pick position only when no active rating exists', () => {
    const score = cardQualityScore({
      activeScore: null,
      liveAvgPickPosition: 1,
      nameRanking: 10,
      rarityScore: 15,
    })
    assert.equal(score, 100)
  })

  it('lets a published leader rating beat live popularity and the hardcoded list', () => {
    const published = leaderPreferenceScore({ activeScore: 3, livePicks: 900, rankIndex: 0 })
    const fallback = leaderPreferenceScore({ activeScore: null, livePicks: 4, rankIndex: 0 })
    assert.ok(published > fallback)
    assert.equal(leaderPreferenceScore({ activeScore: null, livePicks: null, rankIndex: 1 }), 499)
  })
})
