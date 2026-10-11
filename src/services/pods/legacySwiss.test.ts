import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapLegacySwiss, LEGACY_SWISS_SETTINGS, type LegacyMatchRow, type LegacyRoundRow } from './legacySwiss'
import { buildHubView, type HubInputPlayer } from './hubView'
import { podSettings } from './hubLoader'
import { pendingSettings } from './hubView'

const seats = ['lee', 'cal', 'mira', 'jo', 'bot1'].map((id, i) => ({ user_id: id, seat_number: i + 1, is_bot: id.startsWith('bot') }))
const round = (n: number, status = 'complete'): LegacyRoundRow => ({ id: `r${n}`, round_number: n, status, created_at: `2026-08-23T0${n}:00:00Z` })
let clock = 0
const match = (r: number, p1: string | null, p2: string | null, games: (string | null)[], extra: Partial<LegacyMatchRow> = {}): LegacyMatchRow => ({
  id: `m${r}-${p1}-${p2}`, round_id: `r${r}`, player1_id: p1, player2_id: p2, is_bye: false,
  game1_result: games[0] ?? null, game2_result: games[1] ?? null, game3_result: games[2] ?? null,
  match_winner: null, final_confirmed: false, pod_owner_override: false, created_at: new Date(Date.UTC(2026, 7, 23, 0, 0, clock++)).toISOString(), ...extra,
})

test('the old Swiss Practice event reads as a Swiss 3 round Bo3 tournament of the humans who played', () => {
  const t = mapLegacySwiss({
    podId: 'pod', seats, matchmakingStatus: 'complete',
    rounds: [round(1), round(2), round(3)],
    matches: [
      match(1, 'lee', 'cal', ['player1', 'player1'], { match_winner: 'player1', final_confirmed: true }),
      match(1, 'mira', 'jo', ['player2', 'player1', 'player2'], { match_winner: 'player2', final_confirmed: true }),
      match(2, 'lee', 'jo', ['player1', 'player2', 'player1'], { match_winner: 'player1', final_confirmed: true }),
      match(2, 'cal', 'mira', [], { match_winner: 'player2', final_confirmed: true }),
      match(3, 'lee', 'mira', ['draw', 'draw', 'draw'], { match_winner: 'draw', final_confirmed: true, pod_owner_override: true }),
      match(3, 'jo', null, [], { is_bye: true }),
      match(3, 'cal', 'jo', ['player1'], {}),
    ],
  })!
  assert.deepEqual(t.settings, LEGACY_SWISS_SETTINGS)
  assert.equal(t.status, 'complete')
  // Bots never played the old event.
  assert.deepEqual(t.entrants.map(e => e.id), ['lee', 'cal', 'mira', 'jo'])
  const r1 = t.matches.filter(m => m.round === 1)
  assert.deepEqual(r1.map(m => [m.table, m.player1, m.player2, m.games.join(','), m.winner]), [
    [1, 'lee', 'cal', 'player1,player1', 'player1'], [2, 'mira', 'jo', 'player2,player1,player2', 'player2']])
  const r3 = t.matches.filter(m => m.round === 3)
  // Byes sit after the tables and count as a win; an unconfirmed result is still undecided.
  assert.deepEqual(r3.map(m => [m.table, m.player2, m.winner]), [[1, 'mira', 'draw'], [2, 'jo', null], [3, null, 'player1']])
  // A host override, or a confirmed winner with no game results, is a fixed result.
  assert.ok(t.overridden.has('m3-lee-mira'))
  assert.ok(t.overridden.has('m2-cal-mira'))
  assert.ok(!t.overridden.has('m1-lee-cal'))
})

test('an event in progress is running; one that never started is no tournament', () => {
  const running = mapLegacySwiss({ podId: 'p', seats, rounds: [round(1), round(2, 'active')], matches: [match(1, 'lee', 'cal', ['player1', 'player1'], { match_winner: 'player1', final_confirmed: true })] })!
  assert.equal(running.status, 'running')
  assert.equal(mapLegacySwiss({ podId: 'p', seats, rounds: [], matches: [] }), null)
  assert.equal(mapLegacySwiss({ podId: 'p', seats, rounds: [round(1), round(2)], matches: [], matchmakingStatus: 'cancelled' })!.status, 'complete')
})

test('the pod page shows legacy rounds read-only, with standings from the old results', () => {
  const t = mapLegacySwiss({
    podId: 'pod', seats, matchmakingStatus: 'complete', rounds: [round(1), round(2), round(3)],
    matches: [
      match(1, 'lee', 'cal', ['player1', 'player1'], { match_winner: 'player1', final_confirmed: true }),
      match(2, 'lee', 'cal', ['player2', 'player2'], { match_winner: 'player2', final_confirmed: true }),
      match(3, 'lee', 'cal', ['player1', 'player2', 'player1'], { match_winner: 'player1', final_confirmed: true }),
    ],
  })!
  const players: HubInputPlayer[] = seats.map(s => ({ id: s.user_id, name: s.user_id, seat: s.seat_number, isBot: s.is_bot, dropped: false, isReady: true, deck: null, poolShareId: null }))
  const v = buildHubView({ pod: { shareId: 'x', name: 'Old', setCode: 'ASH', setName: 'Ashes', status: 'complete', hostId: 'lee', settings: {} }, viewerId: 'lee', nativePlay: true, players, tournament: t, legacy: true, liveMatches: new Set(), now: 0 })
  assert.equal(v.legacy, true)
  assert.equal(v.nativePlay, false)
  assert.deepEqual(v.tabs.map(x => `${x.label}:${x.state}`), ['Deckbuilding:done', 'Round 1:done', 'Round 2:done', 'Round 3:done', 'Standings:current'])
  assert.deepEqual(v.tournament!.standings.map(s => `${s.name} ${s.record}`), ['lee 2–1', 'cal 1–2'])
  assert.equal(v.tournament!.champion, 'lee')
})

test('a competitive pod with no After the draft choice is Swiss, 3 rounds, Bo3; a saved choice wins', () => {
  const legacy = pendingSettings(podSettings('{"voicePackId":"v"}', true), 8)
  assert.deepEqual([legacy.format, legacy.rounds, legacy.bestOf, legacy.topCut], ['swiss', 3, 3, 0])
  assert.equal(pendingSettings(podSettings({ afterDraft: 'elimination' }, true), 8).format, 'elimination')
  assert.equal(pendingSettings(podSettings({}, false), 8).format, 'none')
})
