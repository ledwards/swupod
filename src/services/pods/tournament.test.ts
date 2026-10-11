import {test} from 'node:test'
import assert from 'node:assert/strict'
import {
  recommendedRounds, normalizeSettings, settingsSummary, settingsSubtitle, decideMatch, overrideGames,
  autoResolveGames, computeStandings, pairSwissRound, chooseBye, bracketSeedOrder, seedBracket, topCutPairings,
  nextBracketRound, bracketRoundNames, planAdvance, champion, CUT_COUNTDOWN_MS,
  type Entrant, type TournamentMatch, type TournamentState, type Pairing, type GameResult,
} from './tournament'

const roster = (n: number, bots: number[] = []): Entrant[] =>
  Array.from({length: n}, (_, i) => ({id: `p${i + 1}`, seat: i + 1, isBot: bots.includes(i + 1)}))
let nextId = 0
const toMatch = (p: Pairing, winner: TournamentMatch['winner'] = null, bestOf: 1 | 3 = 3): TournamentMatch => ({
  id: `m${++nextId}`, ...p, bestOf, games: [], winner: p.player2 ? winner : 'player1',
})
/** Play a round where the lower seat number always wins (a fixed spec, not derived from the code). */
const lowerSeatWins = (p: Pairing): TournamentMatch => toMatch(p, p.player2 && Number(p.player2.slice(1)) < Number(p.player1.slice(1)) ? 'player2' : 'player1')

test('recommended Swiss rounds: 8 → 3, 6 → 3, 5 → 3, 4 → 2, 3 → 2, 2 → 1', () => {
  assert.deepEqual([8, 6, 5, 4, 3, 2].map(recommendedRounds), [3, 3, 3, 2, 2, 1])
})

test('settings default to Swiss, recommended rounds, Bo3, top 4 for 6+ and normalize illegal values', () => {
  assert.deepEqual(normalizeSettings({afterDraft: 'swiss'}, 8), {format: 'swiss', rounds: 3, bestOf: 3, topCut: 4, botsPlay: true})
  assert.deepEqual(normalizeSettings({afterDraft: 'elimination', topCut: 8}, 8), {format: 'elimination', rounds: 3, bestOf: 3, topCut: 0, botsPlay: true})
  assert.equal(normalizeSettings({afterDraft: 'just_draft'}, 8).format, 'none')
  assert.equal(normalizeSettings({format: 'swiss', topCut: 8}, 6).topCut, 0, 'a top 8 needs eight players')
  assert.equal(normalizeSettings({format: 'swiss', rounds: 12}, 4).rounds, 3, 'no more rounds than possible opponents')
  assert.equal(normalizeSettings({format: 'swiss', bestOf: 1, botsPlay: false}, 8).bestOf, 1)
  assert.equal(normalizeSettings({format: 'swiss', botsPlay: false}, 8).botsPlay, false)
})

test('summary and subtitle read like the comps', () => {
  assert.equal(settingsSummary({format: 'swiss', rounds: 3, bestOf: 3, topCut: 4, botsPlay: true}), 'Swiss 3 · Bo3 · Top 4')
  assert.equal(settingsSubtitle({format: 'swiss', rounds: 3, bestOf: 3, topCut: 4, botsPlay: true}), 'Swiss 3 rounds · Top 4')
  assert.equal(settingsSubtitle({format: 'elimination', rounds: 3, bestOf: 3, topCut: 0, botsPlay: true}), 'Elimination · Bo3')
})

test('match results: Bo3 is first to two; a level Swiss Bo3 is a draw; elimination needs a winner', () => {
  assert.equal(decideMatch(['player1'], 3, 'swiss'), null)
  assert.equal(decideMatch(['player1', 'player1'], 3, 'swiss'), 'player1')
  assert.equal(decideMatch(['player1', 'player2', 'player2'], 3, 'swiss'), 'player2')
  assert.equal(decideMatch(['player1', 'player2', 'draw'], 3, 'swiss'), 'draw')
  assert.equal(decideMatch(['player1', 'player2', 'draw'], 3, 'elimination'), null)
  assert.equal(decideMatch(['player1', 'player2', 'draw', 'player2'], 3, 'elimination'), 'player2')
  assert.equal(decideMatch(['draw'], 1, 'swiss'), 'draw')
  assert.equal(decideMatch(['draw'], 1, 'elimination'), null)
  assert.equal(decideMatch(['player2'], 1, 'elimination'), 'player2')
})

test('host override: scores become games, winner takes the last game, elimination cannot draw', () => {
  assert.deepEqual(overrideGames(2, 1, 3, 'swiss'), {games: ['player1', 'player2', 'player1'], winner: 'player1'})
  assert.deepEqual(overrideGames(0, 2, 3, 'elimination'), {games: ['player2', 'player2'], winner: 'player2'})
  assert.equal(overrideGames(1, 1, 3, 'swiss').winner, 'draw')
  assert.equal(overrideGames(1, 0, 1, 'swiss').winner, 'player1')
  assert.throws(() => overrideGames(1, 1, 3, 'elimination'))
  assert.throws(() => overrideGames(3, 0, 3, 'swiss'))
  assert.throws(() => overrideGames(2, 2, 3, 'swiss'))
})

test('bot-vs-bot games auto-resolve to a decided match, reproducibly', () => {
  for (const id of ['a', 'b', 'c', 'd', 'e']) {
    const games = autoResolveGames(id, 3, 'elimination')
    assert.ok(decideMatch(games, 3, 'elimination'), 'decided')
    assert.deepEqual(autoResolveGames(id, 3, 'elimination'), games, 'same id, same games')
    assert.ok(games.every(g => g !== 'draw'))
  }
  assert.equal(autoResolveGames('x', 1, 'swiss').length, 1)
})

test('points: win 3, draw 1, loss 0; a bye is a win', () => {
  const e = roster(3)
  const ms: TournamentMatch[] = [
    toMatch({stage: 'swiss', round: 1, table: 1, player1: 'p1', player2: 'p2'}, 'draw'),
    toMatch({stage: 'swiss', round: 1, table: 2, player1: 'p3', player2: null}),
  ]
  const s = computeStandings(e, ms)
  const by = Object.fromEntries(s.map(r => [r.id, r]))
  assert.equal(by.p3!.points, 3); assert.equal(by.p3!.byes, 1)
  assert.equal(by.p1!.points, 1); assert.equal(by.p2!.points, 1)
  assert.equal(s[0]!.id, 'p3')
})

test('OMW: average of opponents\' match-win rates, each floored at 33%, byes excluded', () => {
  // p1 beat p2, p2 lost again to p3 (0-2 → 0%, floored to 33%), p1 had a bye in round 2.
  const e = roster(4)
  const ms: TournamentMatch[] = [
    toMatch({stage: 'swiss', round: 1, table: 1, player1: 'p1', player2: 'p2'}, 'player1'),
    toMatch({stage: 'swiss', round: 1, table: 2, player1: 'p3', player2: 'p4'}, 'player1'),
    toMatch({stage: 'swiss', round: 2, table: 1, player1: 'p3', player2: 'p2'}, 'player1'),
    toMatch({stage: 'swiss', round: 2, table: 2, player1: 'p1', player2: null}),
  ]
  const by = Object.fromEntries(computeStandings(e, ms).map(r => [r.id, r]))
  assert.ok(Math.abs(by.p1!.omw - 1 / 3) < 1e-9, 'only opponent p2 is 0-2, floored to 33%')
  // p3's opponents: p4 (0-1 → floor 33%) and p2 (0-2 → floor 33%).
  assert.ok(Math.abs(by.p3!.omw - 1 / 3) < 1e-9)
  // p2's opponents: p1 (2-0 incl. bye → 100%) and p3 (2-0 → 100%).
  assert.ok(Math.abs(by.p2!.omw - 1) < 1e-9)
})

test('ties on points break on OMW', () => {
  const e = roster(4)
  const ms: TournamentMatch[] = [
    toMatch({stage: 'swiss', round: 1, table: 1, player1: 'p1', player2: 'p2'}, 'player1'),
    toMatch({stage: 'swiss', round: 1, table: 2, player1: 'p3', player2: 'p4'}, 'player1'),
    toMatch({stage: 'swiss', round: 2, table: 1, player1: 'p1', player2: 'p3'}, 'player1'),
    toMatch({stage: 'swiss', round: 2, table: 2, player1: 'p4', player2: 'p2'}, 'player1'),
  ]
  const s = computeStandings(e, ms).map(r => r.id)
  // p3 and p4 both 1-1; p3's opponents (p4 1-1, p1 2-0) beat p4's (p3 1-1, p2 0-2).
  assert.deepEqual(s, ['p1', 'p3', 'p4', 'p2'])
})

test('round 1 pairs across the table by seat', () => {
  assert.deepEqual(pairSwissRound(roster(8), [], 1).map(p => [p.player1, p.player2]),
    [['p1', 'p5'], ['p2', 'p6'], ['p3', 'p7'], ['p4', 'p8']])
})

test('odd roster: round 1 gives exactly one bye and pairs everyone else', () => {
  const pairs = pairSwissRound(roster(7), [], 1)
  const byes = pairs.filter(p => !p.player2)
  assert.equal(byes.length, 1)
  const seen = pairs.flatMap(p => [p.player1, p.player2]).filter(Boolean)
  assert.equal(new Set(seen).size, 7, 'nobody left unpaired')
  assert.equal(byes[0]!.table, pairs.length, 'the bye is listed last')
})

test('the bye prefers a bot and never goes to the same player twice while others lack one', () => {
  const e = roster(5, [3])
  const s = computeStandings(e, [])
  assert.equal(chooseBye(s, e), 'p3')
  const ms: TournamentMatch[] = []
  const byes: string[] = []
  for (let round = 1; round <= 4; round++) {
    const pairs = pairSwissRound(e, ms, round)
    byes.push(pairs.find(p => !p.player2)!.player1)
    ms.push(...pairs.map(lowerSeatWins))
  }
  assert.equal(new Set(byes).size, 4, `four different bye players: ${byes}`)
})

test('Swiss never repeats an opponent while a rematch-free pairing exists (8 players, 3 rounds)', () => {
  for (const winnerRule of [lowerSeatWins, (p: Pairing) => toMatch(p, 'player2')]) {
    const e = roster(8)
    const ms: TournamentMatch[] = []
    for (let round = 1; round <= 3; round++) {
      const pairs = pairSwissRound(e, ms, round)
      assert.equal(pairs.length, 4)
      for (const p of pairs) {
        const rematch = ms.some(m => [m.player1, m.player2].includes(p.player1) && [m.player1, m.player2].includes(p.player2))
        assert.ok(!rematch, `round ${round}: ${p.player1} v ${p.player2} is a rematch`)
      }
      ms.push(...pairs.map(winnerRule))
    }
  }
})

test('later rounds pair within the same points: 2-0s meet in round 3', () => {
  const e = roster(8)
  const ms: TournamentMatch[] = []
  for (let round = 1; round <= 2; round++) ms.push(...pairSwissRound(e, ms, round).map(lowerSeatWins))
  const undefeated = computeStandings(e, ms).filter(s => s.wins === 2).map(s => s.id).sort()
  const top = pairSwissRound(e, ms, 3)[0]!
  assert.deepEqual([top.player1, top.player2].sort(), undefeated)
})

test('bracket seeding: top 4 is 1v4 2v3, top 8 is 1v8 4v5 2v7 3v6', () => {
  assert.deepEqual(bracketSeedOrder(4), [1, 4, 2, 3])
  assert.deepEqual(bracketSeedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6])
  const s = computeStandings(roster(8), [])
  const ids = s.map(r => r.id)
  assert.deepEqual(topCutPairings(s, 4).map(p => [p.player1, p.player2]), [[ids[0], ids[3]], [ids[1], ids[2]]])
  assert.deepEqual(topCutPairings(s, 8).map(p => [p.player1, p.player2]),
    [[ids[0], ids[7]], [ids[3], ids[4]], [ids[1], ids[6]], [ids[2], ids[5]]])
})

test('elimination: six players get a bracket of eight with byes for seeds 1 and 2', () => {
  const pairs = seedBracket(['s1', 's2', 's3', 's4', 's5', 's6'])
  assert.equal(pairs.length, 4)
  assert.deepEqual(pairs.filter(p => !p.player2).map(p => p.player1).sort(), ['s1', 's2'])
  assert.deepEqual(bracketRoundNames(8), ['Quarterfinals', 'Semifinals', 'Final'])
  assert.deepEqual(bracketRoundNames(4), ['Semifinals', 'Final'])
})

test('elimination bracket: winners of tables 1+2 and 3+4 meet; the final crowns a champion', () => {
  const settings = normalizeSettings({format: 'elimination'}, 8)
  const state: TournamentState = {settings, status: 'running', entrants: roster(8), matches: [], cutStartsAt: null}
  let action = planAdvance(state, 0)
  const names: number[] = []
  while (action.type === 'pair') {
    names.push(action.pairings.length)
    state.matches.push(...action.pairings.map(lowerSeatWins))
    action = planAdvance(state, 0)
  }
  assert.deepEqual(names, [4, 2, 1])
  assert.equal(action.type, 'complete')
  state.status = 'complete'
  assert.equal(champion(state), 'p1')
  const semis = state.matches.filter(m => m.round === 2)
  assert.deepEqual(semis.map(m => [m.player1, m.player2]), [['p1', 'p4'], ['p2', 'p3']])
})

test('rounds auto-advance only when every table has finished', () => {
  const settings = normalizeSettings({format: 'swiss', topCut: 0}, 4)
  const state: TournamentState = {settings, status: 'running', entrants: roster(4), matches: [], cutStartsAt: null}
  const first = planAdvance(state, 0)
  assert.equal(first.type, 'pair')
  if (first.type !== 'pair') return
  state.matches.push(...first.pairings.map(p => toMatch(p)))
  assert.equal(planAdvance(state, 0).type, 'wait', 'nothing finished')
  state.matches[0]!.winner = 'player1'
  assert.equal(planAdvance(state, 0).type, 'wait', 'one table still playing')
  state.matches[1]!.winner = 'player2'
  const second = planAdvance(state, 0)
  assert.equal(second.type, 'pair')
  if (second.type === 'pair') assert.equal(second.pairings[0]!.round, 2)
})

test('Swiss with a top cut: complete Swiss schedules a countdown, then pairs the cut from standings', () => {
  const settings = normalizeSettings({format: 'swiss', rounds: 3, topCut: 4}, 8)
  const state: TournamentState = {settings, status: 'running', entrants: roster(8), matches: [], cutStartsAt: null}
  for (let round = 1; round <= 3; round++) {
    const a = planAdvance(state, 0)
    assert.equal(a.type, 'pair')
    if (a.type === 'pair') state.matches.push(...a.pairings.map(lowerSeatWins))
  }
  const schedule = planAdvance(state, 1000)
  assert.deepEqual(schedule, {type: 'schedule_cut', at: 1000 + CUT_COUNTDOWN_MS})
  state.cutStartsAt = 1000 + CUT_COUNTDOWN_MS
  assert.equal(planAdvance(state, 2000).type, 'wait', 'countdown still running')
  const cut = planAdvance(state, state.cutStartsAt)
  assert.equal(cut.type, 'pair')
  if (cut.type !== 'pair') return
  const top = computeStandings(state.entrants, state.matches).slice(0, 4).map(s => s.id)
  assert.deepEqual(cut.pairings.map(p => [p.player1, p.player2]), [[top[0], top[3]], [top[1], top[2]]])
  assert.ok(cut.pairings.every(p => p.stage === 'elimination' && p.round === 1))
})

test('host override decides a match and lets the round advance', () => {
  const settings = normalizeSettings({format: 'swiss', topCut: 0, rounds: 2}, 4)
  const state: TournamentState = {settings, status: 'running', entrants: roster(4), matches: [], cutStartsAt: null}
  const a = planAdvance(state, 0)
  if (a.type !== 'pair') throw new Error('expected pairings')
  state.matches.push(...a.pairings.map(p => toMatch(p)))
  state.matches[0]!.winner = 'player1'
  // Table 2 is stuck mid-game; the host fixes it 2–1 for player two.
  const fixed = overrideGames(1, 2, 3, 'swiss')
  Object.assign(state.matches[1]!, fixed)
  assert.equal(state.matches[1]!.winner, 'player2')
  assert.equal(planAdvance(state, 0).type, 'pair')
})

test('bot-vs-bot tables never block a round', () => {
  const settings = normalizeSettings({format: 'swiss', topCut: 0}, 4)
  const e = roster(4, [3, 4])
  const pairs = pairSwissRound(e, [], 1) // p1 v p3, p2 v p4: no bot-bot in round 1
  const state: TournamentState = {settings, status: 'running', entrants: e, matches: pairs.map(p => toMatch(p)), cutStartsAt: null}
  for (const m of state.matches) {
    const bots = [m.player1, m.player2].every(id => e.find(x => x.id === id)?.isBot)
    if (bots) { m.games = autoResolveGames(m.id, 3, 'swiss'); m.winner = decideMatch(m.games, 3, 'swiss') }
    else m.winner = 'player1'
  }
  assert.equal(planAdvance(state, 0).type, 'pair')
  const games: GameResult[] = autoResolveGames('bot-table', 3, 'swiss')
  assert.ok(decideMatch(games, 3, 'swiss'))
})
