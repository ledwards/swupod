import {test} from 'node:test'
import assert from 'node:assert/strict'
import {buildHubView, pendingSettings, type HubInputPlayer} from './hubView'
import type {StoredTournament} from './tournamentDb'
import type {TournamentMatch} from './tournament'

const players: HubInputPlayer[] = ['Lee', 'Cal', 'Mira', 'Bot'].map((name, i) => ({id: `p${i + 1}`, name, seat: i + 1, isBot: name === 'Bot', dropped: false, isReady: true, deck: null, poolShareId: `s${i + 1}`}))
const pod = {shareId: 'x', name: 'Thursday', setCode: 'HMW', setName: 'Homeworlds', status: 'complete', hostId: 'p1', settings: {afterDraft: 'swiss'}}
const mm = (round: number, table: number, a: string, b: string, winner: TournamentMatch['winner']): TournamentMatch => ({id: `${round}-${table}`, stage: 'swiss', round, table, player1: a, player2: b, bestOf: 3, games: winner === 'player1' ? ['player1', 'player1'] : winner === 'player2' ? ['player2', 'player2'] : ['player1'], winner})
const t = (matches: TournamentMatch[], extra: Partial<StoredTournament> = {}): StoredTournament => ({podId: 'x', settings: {format: 'swiss', rounds: 2, bestOf: 3, botsPlay: true}, status: 'running', entrants: players.map(p => ({id: p.id, seat: p.seat, isBot: p.isBot})), matches, startedAt: 0, overridden: new Set(), ...extra})

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

test('Swiss done: Standings is current, and there is no top cut tab even for an old saved topCut', () => {
  const old = {...t([mm(1, 1, 'p1', 'p3', 'player1'), mm(1, 2, 'p2', 'p4', 'player1'), mm(2, 1, 'p1', 'p2', 'player1'), mm(2, 2, 'p3', 'p4', 'player2')], {status: 'complete'}),
    settings: {format: 'swiss', rounds: 2, bestOf: 3, topCut: 4, botsPlay: true} as StoredTournament['settings']}
  const v = buildHubView({pod, viewerId: 'p2', nativePlay: true, players, tournament: old, liveMatches: new Set(), now: 0})
  assert.equal(v.tournament!.currentKey, 'standings')
  assert.deepEqual(v.tabs.map(x => x.label), ['Deckbuilding', 'Round 1', 'Round 2', 'Standings'])
  assert.equal(v.subtitle, 'Swiss 2 rounds')
  assert.equal(v.tournament!.standings[0]!.name, 'Lee')
  assert.equal(v.tournament!.champion, 'p1')
  assert.equal(v.viewer.isHost, false)
})

test('decks and pools: the owner and the host can open them; every member once the host makes them public', () => {
  const deck = {leaderName: 'Leader', leaderArt: null, baseName: 'Base', baseArt: null}
  const built = players.map(p => ({...p, deck}))
  const pools = (viewerId: string | null, settings: Record<string, unknown>) =>
    buildHubView({pod: {...pod, settings}, viewerId, nativePlay: true, players: built, tournament: null, liveMatches: new Set(), now: 0}).players.map(p => p.deckPoolShareId)
  assert.deepEqual(pools('p2', {afterDraft: 'swiss'}), [null, 's2', null, null], 'a player sees only their own')
  assert.deepEqual(pools('p1', {afterDraft: 'swiss'}), ['s1', 's2', 's3', 's4'], 'the host sees every deck')
  assert.deepEqual(pools('p2', {afterDraft: 'swiss', decksPublic: true}), ['s1', 's2', 's3', 's4'], 'public: every member')
  assert.deepEqual(pools('stranger', {afterDraft: 'swiss', decksPublic: true}), [null, null, null, null], 'public is for pod members')
  assert.deepEqual(pools(null, {afterDraft: 'swiss', decksPublic: true}), [null, null, null, null])
  assert.equal(buildHubView({pod, viewerId: 'p1', nativePlay: true, players, tournament: null, liveMatches: new Set(), now: 0}).decksPublic, false, 'off by default')
})

test('an open bot-vs-bot table reads as waiting; a decided one does not', () => {
  const bots: HubInputPlayer[] = [...players, {...players[3]!, id: 'p5', seat: 5}]
  const v = buildHubView({pod, viewerId: 'p1', nativePlay: true, players: bots, tournament: t([mm(1, 1, 'p1', 'p2', null), mm(1, 2, 'p4', 'p5', null)]), liveMatches: new Set(), now: 0})
  const [human, bot] = v.tournament!.rounds[0]!.matches
  assert.equal(human!.waiting, false)
  assert.equal(bot!.waiting, true)
  assert.equal(bot!.status, 'playing')
  const done = buildHubView({pod, viewerId: 'p1', nativePlay: true, players: bots, tournament: t([mm(1, 1, 'p1', 'p2', null), mm(1, 2, 'p4', 'p5', 'player1')]), liveMatches: new Set(), now: 0})
  assert.equal(done.tournament!.rounds[0]!.matches[1]!.waiting, false)
})

test('replays: recorded games show for the players and the host; for everyone else only with public decks', () => {
  const replays = new Map([['1-1', [{game: 1, id: 'g1'}, {game: 2, id: 'g2'}]]])
  const games = (viewerId: string, settings: Record<string, unknown>) =>
    buildHubView({pod: {...pod, settings}, viewerId, nativePlay: true, players, tournament: t([mm(1, 1, 'p2', 'p4', 'player1'), mm(1, 2, 'p1', 'p3', 'player1')]), liveMatches: new Set(), replays, now: 0})
      .tournament!.rounds[0]!.matches.map(m => m.replays.map(r => `G${r.game}`).join(' '))
  assert.deepEqual(games('p2', {afterDraft: 'swiss'}), ['G1 G2', ''], 'a player replays their own table')
  assert.deepEqual(games('p1', {afterDraft: 'swiss'}), ['G1 G2', ''], 'the host replays any table')
  assert.deepEqual(games('p3', {afterDraft: 'swiss'}), ['', ''], 'a replay shows both hands, so other tables follow the deck rule')
  assert.deepEqual(games('p3', {afterDraft: 'swiss', decksPublic: true}), ['G1 G2', ''])
  assert.deepEqual(games('stranger', {afterDraft: 'swiss', decksPublic: true}), ['', ''], 'public is for pod members')
})
