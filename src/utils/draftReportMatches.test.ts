import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeCasualReportMatch,
  normalizeCompetitiveReportMatch,
  sortDraftReportMatches,
} from './draftReportMatches'

const competitiveRow = {
  id: 'pm-1',
  round_number: 2,
  wayfinder_match_id: 'wf-competitive',
  wayfinder_replay_url: 'https://wayfinder.news/replay/wf-competitive',
  created_at: '2026-06-01T20:00:00.000Z',
  match_winner: 'player1',
  game1_result: 'player1',
  game2_result: 'player2',
  game3_result: 'player1',
  player1_id: 'u1',
  player2_id: 'u2',
  player1_username: 'Aurebesh',
  player2_username: 'Benthic',
  player1_avatar_url: 'https://example.com/u1.png',
  player2_avatar_url: 'https://example.com/u2.png',
  player1_leader: 'Han Solo',
  player1_leader_image: 'https://example.com/han.png',
  player1_base: 'Echo Base',
  player1_base_image: 'https://example.com/echo.png',
  player1_archetype: 'Han Yellow',
  player2_leader: 'Darth Vader',
  player2_leader_image: 'https://example.com/vader.png',
  player2_base: 'Command Center',
  player2_base_image: 'https://example.com/command.png',
  player2_archetype: 'Vader Blue',
}

describe('draft report match normalization', () => {
  it('maps a competitive player1 row from player1 perspective', () => {
    const match = normalizeCompetitiveReportMatch(competitiveRow, 'u1')

    assert.equal(match.id, 'pm-1')
    assert.equal(match.source, 'competitive')
    assert.equal(match.label, 'Round 2')
    assert.equal(match.roundNumber, 2)
    assert.equal(match.result, 'win')
    assert.deepEqual(match.gameResults, ['W', 'L', 'W'])
    assert.equal(match.opponent.username, 'Benthic')
    assert.equal(match.opponent.leaderName, 'Darth Vader')
    assert.equal(match.player.leaderName, 'Han Solo')
    assert.equal(match.replayUrl, 'https://wayfinder.news/replay/wf-competitive')
    assert.equal(match.wayfinderMatchId, 'wf-competitive')
  })

  it('maps the same competitive row from player2 perspective', () => {
    const match = normalizeCompetitiveReportMatch(competitiveRow, 'u2')

    assert.equal(match.result, 'loss')
    assert.deepEqual(match.gameResults, ['L', 'W', 'L'])
    assert.equal(match.opponent.username, 'Aurebesh')
    assert.equal(match.opponent.leaderName, 'Han Solo')
    assert.equal(match.player.leaderName, 'Darth Vader')
  })

  it('prefers live per-game replay rows for competitive reports', () => {
    const match = normalizeCompetitiveReportMatch({
      ...competitiveRow,
      wayfinder_replay_url: 'https://wayfinder.news/replay/match-level',
      live_games: [
        {
          game_number: 1,
          result: 'player1',
          replay_url: 'https://wayfinder.news/replay/game-1',
          wayfinder_match_id: 'wf-game-1',
          wayfinder_game_id: 'wfg-1',
          completed_at: '2026-06-01T20:10:00.000Z',
        },
        {
          game_number: 2,
          result: 'player2',
          replay_url: 'https://wayfinder.news/replay/game-2',
          wayfinder_match_id: 'wf-game-2',
          wayfinder_game_id: 'wfg-2',
          completed_at: '2026-06-01T20:30:00.000Z',
        },
      ],
    }, 'u1')

    assert.deepEqual(match.gameResults, ['W', 'L'])
    assert.equal(match.replayUrl, 'https://wayfinder.news/replay/match-level')
    assert.equal(match.games.length, 2)
    assert.equal(match.games[0].replayUrl, 'https://wayfinder.news/replay/game-1')
    assert.equal(match.games[1].wayfinderGameId, 'wfg-2')
  })

  it('keeps historical competitive rows valid when no live game rows exist', () => {
    const match = normalizeCompetitiveReportMatch({
      ...competitiveRow,
      live_games: [],
    }, 'u1')

    assert.deepEqual(match.gameResults, ['W', 'L', 'W'])
    assert.deepEqual(match.games, [])
    assert.equal(match.replayUrl, 'https://wayfinder.news/replay/wf-competitive')
  })

  it('maps casual rows that are already user-perspective', () => {
    const match = normalizeCasualReportMatch({
      id: 'cm-1',
      wayfinder_match_id: 'wf-casual',
      wayfinder_replay_url: 'https://wayfinder.news/replay/wf-casual',
      result: 'draw',
      game1_result: 'W',
      game2_result: 'L',
      game3_result: 'D',
      opponent_name: 'Karabast Rival',
      player_leader: 'Sabine Wren',
      player_leader_image: 'https://example.com/sabine.png',
      player_base: 'Energy Conversion Lab',
      player_archetype: 'Sabine ECL',
      opponent_leader: 'Boba Fett',
      opponent_leader_image: 'https://example.com/boba.png',
      opponent_base: 'Tarkintown',
      opponent_archetype: 'Boba Yellow',
      played_at: new Date('2026-06-02T21:00:00.000Z'),
    })

    assert.equal(match.id, 'cm-1')
    assert.equal(match.source, 'casual')
    assert.equal(match.label, 'Match')
    assert.equal(match.result, 'draw')
    assert.deepEqual(match.gameResults, ['W', 'L', 'D'])
    assert.equal(match.opponent.username, 'Karabast Rival')
    assert.equal(match.player.leaderName, 'Sabine Wren')
    assert.equal(match.playedAt, '2026-06-02T21:00:00.000Z')
  })

  it('sorts competitive rounds by round number and casual matches by played time', () => {
    const matches = [
      { id: 'casual-late', source: 'casual', roundNumber: null, playedAt: '2026-06-02T21:00:00.000Z' },
      { id: 'round-3', source: 'competitive', roundNumber: 3, playedAt: '2026-06-01T23:00:00.000Z' },
      { id: 'round-1', source: 'competitive', roundNumber: 1, playedAt: '2026-06-01T20:00:00.000Z' },
      { id: 'casual-early', source: 'casual', roundNumber: null, playedAt: '2026-06-02T19:00:00.000Z' },
    ]

    assert.deepEqual(sortDraftReportMatches(matches).map(m => m.id), [
      'round-1',
      'round-3',
      'casual-early',
      'casual-late',
    ])
  })
})
