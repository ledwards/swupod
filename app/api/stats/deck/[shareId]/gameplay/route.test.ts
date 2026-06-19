import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildDeckGameplayResponse } from './route'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROUTE_SRC = readFileSync(join(__dirname, 'route.ts'), 'utf8')

function pool(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pool-1',
    user_id: 'user-1',
    share_id: 'deck123',
    name: 'LAW Sealed',
    set_code: 'LAW',
    pool_type: 'sealed',
    pod_id: 'pod-1',
    wins: 2,
    losses: 1,
    draws: 0,
    captured_matches: 2,
    updated_at: '2026-06-13T12:00:00.000Z',
    deck_builder_state: {
      activeLeader: 'leader-1',
      activeBase: 'base-1',
      cardPositions: {
        'leader-1': { section: 'leaders', card: { name: 'Han Solo', imageUrl: '/han.png', isLeader: true } },
        'base-1': { section: 'bases', card: { name: 'Data Vault', imageUrl: '/vault.png', isBase: true } },
      },
    },
    ...overrides,
  }
}

describe('buildDeckGameplayResponse', () => {
  it('keeps the aggregate record build-exact and maps casual replays', () => {
    const response = buildDeckGameplayResponse(pool(), [], [{
      id: 'casual-1',
      wayfinder_match_id: 'wf-casual',
      wayfinder_replay_url: 'https://wayfinder.example/replay/wf-casual',
      result: 'win',
      game1_result: 'W',
      game2_result: 'L',
      game3_result: 'W',
      opponent_name: 'Rival',
      opponent_leader: 'Boba Fett',
      played_at: '2026-06-13T13:00:00.000Z',
      pool_share_id: 'deck123',
      pool_name: 'LAW Sealed',
      set_code: 'LAW',
      pool_type: 'sealed',
      deck_builder_state: pool().deck_builder_state,
    }])

    assert.equal(response.summary.wins, 2)
    assert.equal(response.summary.losses, 1)
    assert.equal(response.summary.winRate, 66.7)
    assert.equal(response.deck.recordIsBuildExact, true)
    assert.equal(response.replays.length, 1)
    assert.equal(response.replays[0].result, 'win')
    assert.deepEqual(response.replays[0].gameResults, ['W', 'L', 'W'])
  })

  it('uses the owner perspective for competitive pod-attributed rows', () => {
    const response = buildDeckGameplayResponse(pool(), [{
      match_id: 'match-1',
      wayfinder_match_id: 'wf-competitive',
      wayfinder_replay_url: 'https://wayfinder.example/replay/wf-competitive',
      created_at: '2026-06-13T13:00:00.000Z',
      match_winner: 'player2',
      game1_result: 'player1',
      game2_result: 'player2',
      game3_result: 'player2',
      player1_id: 'opponent',
      player2_id: 'user-1',
      opponent_username: 'Opponent',
      opponent_leader: 'Sabine Wren',
      pool_share_id: 'deck123',
      pool_name: 'LAW Sealed',
      set_code: 'LAW',
      pool_type: 'sealed',
      deck_builder_state: pool().deck_builder_state,
    }], [])

    assert.equal(response.deck.competitiveAttribution, 'pod')
    assert.equal(response.replays[0].result, 'win')
    assert.deepEqual(response.replays[0].gameResults, ['L', 'W', 'W'])
  })

  it('ownerless pools show aggregate record with an empty replay list', () => {
    const response = buildDeckGameplayResponse(pool({ user_id: null, pod_id: null }), [], [])
    assert.equal(response.summary.matches, 3)
    assert.equal(response.deck.ownerId, null)
    assert.equal(response.deck.competitiveAttribution, 'none')
    assert.equal(response.replays.length, 0)
  })

  it('dedupes casual and competitive rows with the same Wayfinder match id', () => {
    const sameReplay = {
      wayfinder_match_id: 'wf-same',
      wayfinder_replay_url: 'https://wayfinder.example/replay/wf-same',
      set_code: 'LAW',
      pool_type: 'sealed',
      pool_share_id: 'deck123',
      pool_name: 'LAW Sealed',
      deck_builder_state: pool().deck_builder_state,
    }
    const response = buildDeckGameplayResponse(
      pool(),
      [{ ...sameReplay, match_id: 'competitive-1', created_at: '2026-06-13T13:00:00.000Z', match_winner: 'player1', player1_id: 'user-1', player2_id: 'opponent' }],
      [{ ...sameReplay, id: 'casual-1', result: 'win', played_at: '2026-06-13T13:00:00.000Z' }],
    )
    assert.equal(response.replays.length, 1)
  })
})

describe('GET /api/stats/deck/[shareId]/gameplay route structure', () => {
  it('is shareId-open and rate limited', () => {
    assert.match(ROUTE_SRC, /applyRateLimit\(request\)/)
    assert.doesNotMatch(ROUTE_SRC, /requireAuth\(request\)/)
    assert.match(ROUTE_SRC, /WHERE cp\.share_id = \$1/)
  })

  it('uses casual exact attribution and competitive pod-level attribution', () => {
    assert.match(ROUTE_SRC, /FROM casual_matches cm[\s\S]*?WHERE cm\.card_pool_id = \$1/)
    assert.match(ROUTE_SRC, /FROM practice_matches pm[\s\S]*?WHERE pm\.pod_id = cp\.pod_id/)
    assert.match(ROUTE_SRC, /pm\.player1_id = \$2 OR pm\.player2_id = \$2/)
  })

  it('returns 404 for unknown shareId and public cache headers for shareable reads', () => {
    assert.match(ROUTE_SRC, /Pool not found', 404/)
    assert.match(ROUTE_SRC, /Cache-Control', 'public, max-age=60'/)
  })
})
