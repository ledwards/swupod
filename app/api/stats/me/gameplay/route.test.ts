import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildGameplayResponse, buildTerronkDevGameplayFixture, buildLeaderBreakdown, buildArchetypeBreakdown } from './route'
import type { GameplayReplay } from './route'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROUTE_SRC = readFileSync(join(__dirname, 'route.ts'), 'utf8')

describe('buildGameplayResponse', () => {
  it('coerces record, win rate, capture, replay, and recent-pool values', () => {
    const response = buildGameplayResponse(
      {
        wins: '4',
        losses: '2',
        draws: '1',
        pools: '2',
        captured_matches: '5',
        decks_played: '3',
      },
      [{ key: 'sealed', label: 'sealed', wins: '3', losses: '1', draws: '0', pools: '1', captured_matches: '4' }],
      [{ key: 'LAW', label: 'LAW', wins: '4', losses: '2', draws: '1', pools: '2', captured_matches: '5' }],
      [{
        share_id: 'abc123',
        name: 'LAW Sealed',
        set_code: 'LAW',
        pool_type: 'sealed',
        deck_builder_state: {
          activeLeader: 'leader-1',
          activeBase: 'base-1',
          cardPositions: {
            'leader-1': { section: 'leaders', card: { name: 'Han Solo', imageUrl: '/han.png', isLeader: true } },
            'base-1': { section: 'bases', card: { name: 'Data Vault', imageUrl: '/vault.png', isBase: true } },
            'card-1': { section: 'deck', visible: true, card: { name: 'Unit' } },
          },
        },
        wins: '2',
        losses: '1',
        draws: '0',
        captured_matches: '3',
        updated_at: '2026-06-13T12:00:00.000Z',
      }],
      { replays_recorded: '2' },
      [{
        match_id: 'match-row-1',
        wayfinder_match_id: 'wf-1',
        wayfinder_replay_url: 'https://replay.wayfinder.news/playback/wf-1',
        created_at: '2026-06-13T13:00:00.000Z',
        match_winner: 'player1',
        game1_result: 'player1',
        game2_result: 'player2',
        game3_result: 'player1',
        player1_id: 'user-1',
        player2_id: 'user-2',
        opponent_username: 'Opponent',
        opponent_avatar_url: 'https://cdn.example/avatar.png',
        pool_share_id: 'abc123',
        pool_name: 'LAW Sealed',
        set_code: 'LAW',
        pool_type: 'sealed',
        deck_builder_state: {
          activeLeader: 'leader-1',
          activeBase: 'base-1',
          cardPositions: {
            'leader-1': { section: 'leaders', card: { name: 'Han Solo', imageUrl: '/han.png', isLeader: true } },
            'base-1': { section: 'bases', card: { name: 'Data Vault', imageUrl: '/vault.png', isBase: true } },
            'card-1': { section: 'deck', visible: true, card: { name: 'Unit' } },
          },
        },
      }],
      'user-1'
    )

    assert.equal(response.summary.matches, 7)
    assert.equal(response.summary.winRate, 57.1)
    assert.equal(response.summary.decksPlayed, 3)
    assert.equal(response.summary.replaysRecorded, 5)
    assert.equal(response.formatBreakdown[0].label, 'Sealed')
    assert.equal(response.recentPools[0].shareId, 'abc123')
    assert.equal(response.recentPools[0].formatLabel, 'Sealed')
    assert.equal(response.recentPools[0].leaderName, 'Han Solo')
    assert.equal(response.replays[0].result, 'win')
    assert.deepEqual(response.replays[0].gameResults, ['W', 'L', 'W'])
    // Replay leader art is swapped for the Hyperspace front art (by name+set).
    assert.match(response.replays[0].leaderImageUrl, /Han_Solo/)
  })

  it('derives the canonical replay link from the match id and surfaces the pool draft share id', () => {
    const response = buildGameplayResponse(
      null, [], [], [], { replays_recorded: '1' },
      [{
        match_id: 'm1',
        wayfinder_match_id: 'wf-99',
        // A stale/broken stored URL — the API ignores it in favor of the
        // canonical playback URL derived from the match id.
        wayfinder_replay_url: 'https://wayfinder.news/live/wf-99',
        created_at: '2026-06-13T13:00:00.000Z',
        match_winner: 'player1',
        game1_result: 'player1',
        player1_id: 'user-1',
        player2_id: 'user-2',
        pool_share_id: 'pool-9',
        pool_draft_share_id: 'draft-9',
        pool_name: 'LAW Draft',
        set_code: 'LAW',
        pool_type: 'draft',
        deck_builder_state: {},
      }],
      'user-1'
    )
    const replay = response.replays[0]
    // SPEC: replay link is https://replay.wayfinder.news/playback/<matchId>,
    // never the stored wayfinder.news/live/ form.
    assert.equal(replay.replayUrl, 'https://replay.wayfinder.news/playback/wf-99')
    assert.equal(replay.pool.draftShareId, 'draft-9')
  })

  it('FIXED: archetype + replay leader follow the match-recorded leader, not a sibling pool deck', () => {
    // Regression (the "Dedra Meero shows Ahsoka's photo" bug): a pod can hold
    // several built decks, and the replay query joins the MOST RECENTLY UPDATED
    // pool for that pod — so a Han Solo match can pick up a sibling Ahsoka deck's
    // leader + art while practice_matches.my_archetype still (correctly) reads
    // "Han Solo Red 30". The legend then showed Ahsoka's photo under the Han
    // archetype. The leader actually played (my_leader) must win.
    const response = buildGameplayResponse(
      null, [], [], [], { replays_recorded: '1' },
      [{
        match_id: 'm-mismatch',
        wayfinder_match_id: 'wf-mm',
        wayfinder_replay_url: 'https://replay.wayfinder.news/playback/wf-mm',
        created_at: '2026-06-13T13:00:00.000Z',
        match_winner: 'player1',
        game1_result: 'player1',
        player1_id: 'user-1',
        player2_id: 'user-2',
        // What the player actually played this match (recorded by the plugin).
        my_leader: 'Han Solo',
        my_archetype: 'Han Solo Red 30',
        pool_share_id: 'pool-mm',
        pool_name: 'LAW Draft',
        set_code: 'LAW',
        pool_type: 'draft',
        // The joined sibling pool deck — a DIFFERENT leader with stale art.
        deck_builder_state: {
          activeLeader: 'L',
          activeBase: 'B',
          cardPositions: {
            L: { section: 'leaders', card: { name: 'Ahsoka Tano', imageUrl: '/ahsoka.png', backImageUrl: '/ahsoka_unit.png', isLeader: true } },
          },
        },
      }],
      'user-1'
    )
    const replay = response.replays[0]
    // The replay reflects the leader actually played, not the sibling deck.
    assert.equal(replay.leaderName, 'Han Solo')
    // Both art fields resolve to Han Solo by name — never the stale Ahsoka art.
    assert.match(replay.leaderImageUrl!, /Han_Solo/)
    assert.match(replay.leaderBackImageUrl!, /Han_Solo/)
    assert.doesNotMatch(replay.leaderBackImageUrl!, /ahsoka/i)
    // The "Your Archetypes" legend thumbnail (leaderBackImageUrl) is Han's art.
    const arch = response.archetypeBreakdown.find((a) => a.archetype === 'Han Solo Red 30')!
    assert.ok(arch, 'archetype row exists')
    assert.match(arch.leaderBackImageUrl!, /Han_Solo/)
  })
})

describe('buildLeaderBreakdown', () => {
  const poolWithLeader = (leaderName: string, imageUrl: string | null, wins: number, losses: number, draws = 0) => ({
    deck_builder_state: {
      activeLeader: 'L',
      cardPositions: { L: { card: { name: leaderName, imageUrl } } },
    },
    wins,
    losses,
    draws,
  })

  it('aggregates record by leader and computes win rate per leader', () => {
    const result = buildLeaderBreakdown([
      poolWithLeader('Han Solo', '/han.png', 3, 1),
      poolWithLeader('Han Solo', '/han.png', 1, 0),
      poolWithLeader('Boba Fett', '/boba.png', 1, 3),
    ])

    // Han: 4W 1L across 2 pools → 5 matches, 80% win rate.
    const han = result.find((r) => r.leaderName === 'Han Solo')!
    assert.equal(han.wins, 4)
    assert.equal(han.losses, 1)
    assert.equal(han.matches, 5)
    assert.equal(han.pools, 2)
    assert.equal(han.winRate, 80) // SPEC: 4/5 = 80.0%
    assert.equal(han.leaderImageUrl, '/han.png')

    // Boba: 1W 3L → 25%.
    const boba = result.find((r) => r.leaderName === 'Boba Fett')!
    assert.equal(boba.winRate, 25) // SPEC: 1/4 = 25.0%

    // Sorted by matches desc → Han (5) before Boba (4).
    assert.equal(result[0].leaderName, 'Han Solo')
  })

  it('skips pools with no leader or no games', () => {
    const result = buildLeaderBreakdown([
      poolWithLeader('Han Solo', '/han.png', 0, 0), // no games
      { deck_builder_state: { cardPositions: {} }, wins: 2, losses: 1 }, // no leader
    ])
    assert.equal(result.length, 0)
  })

  it('splits win rate by the base color aspect (byBase)', () => {
    const poolWithBase = (leader: string, baseAspect: string, wins: number, losses: number) => ({
      deck_builder_state: {
        activeLeader: 'L', activeBase: 'B',
        cardPositions: {
          L: { card: { name: leader, imageUrl: '/l.png' } },
          B: { card: { name: 'A Base', aspects: [baseAspect] } },
        },
      },
      wins, losses, draws: 0,
    })
    const result = buildLeaderBreakdown([
      poolWithBase('Cassian', 'Vigilance', 3, 1), // 75% on Vigilance
      poolWithBase('Cassian', 'Cunning', 1, 3),   // 25% on Cunning
    ])
    const cassian = result.find((r) => r.leaderName === 'Cassian')!
    const vig = cassian.byBase.find((b) => b.aspect === 'Vigilance')!
    const cun = cassian.byBase.find((b) => b.aspect === 'Cunning')!
    assert.equal(vig.winRate, 75) // SPEC: 3/4
    assert.equal(cun.winRate, 25) // SPEC: 1/4
    assert.equal(vig.matches, 4)
  })
})

describe('buildArchetypeBreakdown', () => {
  const replay = (over: Partial<GameplayReplay> & { archetype: string | null }): GameplayReplay => ({
    id: 'r',
    wayfinderMatchId: null,
    replayUrl: 'https://replay.example/x',
    playedAt: null,
    result: 'win',
    gameResults: [],
    opponent: { username: null, avatarUrl: null, leaderName: null, leaderImageUrl: null, baseName: null, archetype: null },
    pool: { shareId: null, draftShareId: null, name: 'Pool', setCode: 'LAW', format: 'sealed', formatLabel: 'Sealed' },
    leaderName: null,
    baseName: null,
    leaderImageUrl: null,
    leaderBackImageUrl: null,
    baseImageUrl: null,
    archetype: null,
    deckCardCount: 0,
    ...over,
  })

  it('aggregates games by archetype, strips (Limited), and keeps the unit-side art', () => {
    const result = buildArchetypeBreakdown([
      replay({ archetype: 'Ahsoka Blue30 (Limited)', gameResults: ['W', 'L'], leaderName: 'Ahsoka Tano', leaderImageUrl: '/ahsoka.png', leaderBackImageUrl: '/ahsoka_unit.png' }),
      replay({ archetype: 'Ahsoka Blue30', gameResults: ['W'] }),
      replay({ archetype: 'Ezra Green30 (Limited)', gameResults: ['L'] }),
    ])
    // "(Limited)" stripped → both Ahsoka rows collapse into one archetype.
    const ahsoka = result.find((r) => r.archetype === 'Ahsoka Blue30')!
    assert.ok(ahsoka, 'archetype name carries no (Limited) tag')
    assert.equal(ahsoka.wins, 2)
    assert.equal(ahsoka.losses, 1)
    assert.equal(ahsoka.matches, 3)
    assert.equal(ahsoka.winRate, 66.7) // SPEC: 2/3 = 66.7%
    assert.equal(ahsoka.leaderName, 'Ahsoka Tano')
    // Unit-side (back) art is captured for the legend, alongside the front.
    assert.equal(ahsoka.leaderBackImageUrl, '/ahsoka_unit.png')
    assert.equal(ahsoka.leaderImageUrl, '/ahsoka.png')
    // Sorted by games desc → Ahsoka (3) before Ezra (1).
    assert.equal(result[0].archetype, 'Ahsoka Blue30')
  })

  it('falls back to the match result when there are no per-game results', () => {
    const result = buildArchetypeBreakdown([
      replay({ archetype: 'Boba Red30', gameResults: [], result: 'win' }),
      replay({ archetype: 'Boba Red30', gameResults: [], result: 'loss' }),
    ])
    const boba = result.find((r) => r.archetype === 'Boba Red30')!
    assert.equal(boba.wins, 1)
    assert.equal(boba.losses, 1)
    assert.equal(boba.matches, 2)
    assert.equal(boba.winRate, 50)
  })

  it('skips replays with no archetype or no scored games', () => {
    const result = buildArchetypeBreakdown([
      replay({ archetype: null, gameResults: ['W'] }), // no archetype
      replay({ archetype: 'Pending Deck', gameResults: [], result: 'pending' }), // unscored
    ])
    assert.equal(result.length, 0)
  })
})

describe('buildTerronkDevGameplayFixture', () => {
  it('creates nonzero gameplay data from real pool links for local Terronk testing', () => {
    const response = buildTerronkDevGameplayFixture([
      {
        share_id: 'law-real-pool',
        name: "terronk's LAW Sealed Pool",
        set_code: 'LAW',
        pool_type: 'sealed',
        updated_at: '2026-06-13T12:00:00.000Z',
      },
      {
        share_id: 'sec-real-pool',
        name: "terronk's SEC Draft Pool",
        set_code: 'SEC',
        pool_type: 'draft',
        updated_at: '2026-06-12T12:00:00.000Z',
      },
    ])

    assert.equal(response.summary.matches, 25)
    assert.equal(response.summary.winRate, 60)
    assert.equal(response.summary.replaysRecorded, 21)
    assert.equal(response.formatBreakdown[0].label, 'Sealed')
    assert.equal(response.recentPools[0].shareId, 'law-real-pool')
    assert.equal(response.recentPools[1].formatLabel, 'Draft')
  })
})

describe('GET /api/stats/me/gameplay route structure', () => {
  it('requires auth and applies rate limiting', () => {
    assert.match(ROUTE_SRC, /applyRateLimit\(request\)/)
    assert.match(ROUTE_SRC, /requireAuth\(request\)/)
  })

  it('filters owned card_pools by user_id, pool_type, and updated_at date range', () => {
    assert.match(ROUTE_SRC, /FROM card_pools/)
    assert.match(ROUTE_SRC, /user_id = \$1/)
    assert.match(ROUTE_SRC, /pool_type IN \('sealed', 'draft', 'chaos_sealed', 'pack_blitz', 'pack_wars', 'rotisserie'\)/)
    assert.match(ROUTE_SRC, /updated_at >= \$2/)
    assert.match(ROUTE_SRC, /updated_at < \(\$3::date \+ interval '1 day'\)/)
  })

  it('aggregates record, Wayfinder captures, deck play visits, and replay URLs', () => {
    assert.match(ROUTE_SRC, /SUM\(wins\)/)
    assert.match(ROUTE_SRC, /SUM\(losses\)/)
    assert.match(ROUTE_SRC, /SUM\(draws\)/)
    assert.match(ROUTE_SRC, /cardinality\(wayfinder_match_ids\)/)
    assert.match(ROUTE_SRC, /FROM deck_play_visits/)
    assert.match(ROUTE_SRC, /FROM practice_matches/)
    assert.match(ROUTE_SRC, /wayfinder_replay_url IS NOT NULL/)
    assert.match(ROUTE_SRC, /ORDER BY created_at DESC/)
    assert.match(ROUTE_SRC, /LIMIT 50/)
  })

  it('filters every pool-scoped query by the global Set filter ($4)', () => {
    assert.match(ROUTE_SRC, /\$4 = 'all' OR set_code = \$4/)
    assert.match(ROUTE_SRC, /\$4 = 'all' OR cp\.set_code = \$4/)
  })

  it('returns private cache headers', () => {
    assert.match(ROUTE_SRC, /Cache-Control', 'private, max-age=60'/)
    assert.match(ROUTE_SRC, /Vary', 'Cookie'/)
  })

  it('guards the Terronk development fixture out of production', () => {
    assert.match(ROUTE_SRC, /process\.env\.NODE_ENV === 'production'/)
    assert.match(ROUTE_SRC, /session\.username/)
    assert.match(ROUTE_SRC, /X-PTP-Dev-Fixture', 'terronk-gameplay'/)
  })
})
