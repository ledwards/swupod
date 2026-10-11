import {test} from 'node:test'
import assert from 'node:assert/strict'
import {buildHubView, pendingSettings, type HubInputPlayer} from './hubView'
import type {StoredTournament} from './tournamentDb'
import type {TournamentMatch} from './tournament'

const players: HubInputPlayer[] = ['Lee', 'Cal', 'Mira', 'Bot'].map((name, i) => ({id: `p${i + 1}`, name, seat: i + 1, isBot: name === 'Bot', dropped: false, isReady: true, deck: null, poolShareId: `s${i + 1}`}))
const pod = {shareId: 'x', name: 'Thursday', setCode: 'HMW', setName: 'Homeworlds', status: 'complete', hostId: 'p1', settings: {afterDraft: 'swiss'}}
const mm = (round: number, table: number, a: string, b: string, winner: TournamentMatch['winner']): TournamentMatch => ({id: `${round}-${table}`, stage: 'swiss', round, table, player1: a, player2: b, bestOf: 3, games: winner === 'player1' ? ['player1', 'player1'] : winner === 'player2' ? ['player2', 'player2'] : ['player1'], winner})
const t = (matches: TournamentMatch[], extra: Partial<StoredTournament> = {}): StoredTournament => ({podId: 'x', settings: {format: 'swiss', rounds: 2, bestOf: 3, topCut: 4, botsPlay: true}, status: 'running', entrants: players.map(p => ({id: p.id, seat: p.seat, isBot: p.isBot})), matches, cutStartsAt: null, startedAt: 0, overridden: new Set(), ...extra})

test('Create a Pod choices become the pre-start settings', () => {
  assert.equal(pendingSettings({afterDraft: 'elimination'}, 8).format, 'elimination')
  assert.equal(pendingSettings({afterDraft: 'none'}, 8).format, 'none')
  assert.equal(pendingSettings({afterDraft: 'swiss', tournament: {format: 'swiss', rounds: 2}}, 8).rounds, 2)
})

test('before Round 1: Deckbuilding is current, rounds are upcoming, Standings sits at the end', () => {
  const v = buildHubView({pod, viewerId: 'p1', nativePlay: true, players, tournament: null, liveMatches: new Set(), now: 0})
  assert.deepEqual(v.tabs.map(x => `${x.label}:${x.state}`), ['Deckbuilding:current', 'Round 1:upcoming', 'Round 2:upcoming', 'Standings:done'])
  assert.equal(v.viewer.isHost, true)
  assert.equal(v.summary, 'Swiss 2 · Bo3')
})

test('a live round: points shown are from before the round; your table is marked', () => {
  const v = buildHubView({pod, viewerId: 'p1', nativePlay: true, players, tournament: t([mm(1, 1, 'p1', 'p3', 'player1'), mm(1, 2, 'p2', 'p4', 'player1'), mm(2, 1, 'p1', 'p2', null), mm(2, 2, 'p3', 'p4', 'player2')]), liveMatches: new Set(['2-1']), now: 0})
  assert.equal(v.tournament!.currentKey, 'swiss-2')
  const r2 = v.tournament!.rounds.find(r => r.key === 'swiss-2')!
  assert.equal(r2.matches[0]!.p1.points, 3)
  assert.equal(r2.matches[0]!.isYours, true)
  assert.equal(r2.matches[0]!.live, true)
  assert.equal(r2.matches[0]!.gameNumber, 2)
  assert.equal(r2.matches[1]!.status, 'finished')
})

test('Swiss done with a cut counting down: Standings is current', () => {
  const v = buildHubView({pod, viewerId: 'p2', nativePlay: true, players, tournament: t([mm(1, 1, 'p1', 'p3', 'player1'), mm(1, 2, 'p2', 'p4', 'player1'), mm(2, 1, 'p1', 'p2', 'player1'), mm(2, 2, 'p3', 'p4', 'player2')], {cutStartsAt: 1000}), liveMatches: new Set(), now: 0})
  assert.equal(v.tournament!.currentKey, 'standings')
  assert.equal(v.tournament!.standings[0]!.name, 'Lee')
  assert.equal(v.viewer.isHost, false)
})
