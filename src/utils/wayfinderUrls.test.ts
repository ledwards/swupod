import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { wayfinderReplayUrl, wayfinderMatchesUrl, resolveReplayUrl } from './wayfinderUrls'

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

  it('FIXED: strips the ingestion ing- prefix so the id is the bare capture event id', () => {
    // BUG: PTP stores Wayfinder's server-side gameId (`ing-${eventId}`) in
    // wayfinder_match_id. The replay player resolves /playback/<id> against the
    // capture event_id, which is the bare `match_...`; an `ing-...` id matches no
    // event -> "This replay is out of range" + Discord login.
    assert.equal(
      wayfinderReplayUrl('ing-match_1781829124602_3osa8h'),
      'https://replay.wayfinder.news/playback/match_1781829124602_3osa8h'
    )
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

describe('resolveReplayUrl', () => {
  it('keeps a stored canonical playback URL as-is', () => {
    assert.equal(
      resolveReplayUrl('wf-1', 'https://replay.wayfinder.news/playback/evt-xyz'),
      'https://replay.wayfinder.news/playback/evt-xyz'
    )
  })

  it('repairs a broken wayfinder.news/live/ URL by deriving from the match id', () => {
    assert.equal(
      resolveReplayUrl('wf-1', 'https://wayfinder.news/live/wf-1'),
      'https://replay.wayfinder.news/playback/wf-1'
    )
  })

  it('derives from the match id when nothing is stored', () => {
    assert.equal(resolveReplayUrl('wf-2', ''), 'https://replay.wayfinder.news/playback/wf-2')
  })

  // Real prod casual_matches rows behind the /me "out of range" P0 (2026-06-19).
  it('FIXED: repairs prod row 2 (legacy /live/ + ing- match id) to a resolvable playback URL', () => {
    assert.equal(
      resolveReplayUrl(
        'ing-match_1781829124602_3osa8h',
        'https://wayfinder.news/live/match_1781829124602_3osa8h'
      ),
      'https://replay.wayfinder.news/playback/match_1781829124602_3osa8h'
    )
  })

  it('keeps prod row 1 (already-canonical /playback/) unchanged', () => {
    assert.equal(
      resolveReplayUrl(
        'ing-match_1781900850124_ss5ntr',
        'https://replay.wayfinder.news/playback/match_1781900850124_ss5ntr'
      ),
      'https://replay.wayfinder.news/playback/match_1781900850124_ss5ntr'
    )
  })

  it('FIXED: canonicalizes a stored /playback/ing- URL the Companion mis-sent', () => {
    assert.equal(
      resolveReplayUrl('ing-x', 'https://replay.wayfinder.news/playback/ing-match_1_a'),
      'https://replay.wayfinder.news/playback/match_1_a'
    )
  })
})
