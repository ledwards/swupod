import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { wayfinderReplayUrl, wayfinderMatchesUrl } from './wayfinderUrls'

describe('wayfinderReplayUrl', () => {
  it('builds the canonical replay-playback URL from a match id', () => {
    // SPEC: a match replay always lives at
    // https://replay.wayfinder.news/playback/<matchId>
    assert.equal(
      wayfinderReplayUrl('match_1781829124602_3osa8h'),
      'https://replay.wayfinder.news/playback/match_1781829124602_3osa8h'
    )
  })

  it('returns an empty string when there is no match id', () => {
    assert.equal(wayfinderReplayUrl(null), '')
    assert.equal(wayfinderReplayUrl(undefined), '')
    assert.equal(wayfinderReplayUrl('   '), '')
  })
})

describe('wayfinderMatchesUrl', () => {
  it('points at the Companion matches list', () => {
    // SPEC: the Companion site lives on plugin.wayfinder.news (a different host
    // from the replay player).
    assert.equal(wayfinderMatchesUrl(), 'https://plugin.wayfinder.news/matches')
  })

  it('points at a single match when given an id', () => {
    assert.equal(wayfinderMatchesUrl('wf-1'), 'https://plugin.wayfinder.news/matches/wf-1')
  })
})
