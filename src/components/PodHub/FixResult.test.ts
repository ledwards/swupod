import {test} from 'node:test'
import assert from 'node:assert/strict'
import {tallyOf, tallyPreview, tallyResult} from './FixResult'
import {overrideGames} from '../../services/pods/tournament'

const names: [string, string] = ['terronk', 'Bot']

test('fix result: the steppers start from the games reported so far', () => {
  assert.deepEqual(tallyOf([], 3), {p1: 0, p2: 0, draws: 0})
  assert.deepEqual(tallyOf(['player1', 'player2', 'player1'], 3), {p1: 2, p2: 1, draws: 0})
  assert.deepEqual(tallyOf(['draw', 'player2'], 3), {p1: 0, p2: 1, draws: 1})
  assert.deepEqual(tallyOf(['player1'], 1), {p1: 1, p2: 0, draws: 0})
})

test('fix result: only a final score can be submitted, and its preview is one line', () => {
  const r = (p1: number, p2: number, draws: number, bestOf: 1 | 3 = 3, stage: 'swiss' | 'elimination' = 'swiss') => tallyPreview({p1, p2, draws}, bestOf, stage, names)
  assert.equal(r(2, 1, 0), 'terronk wins 2–1')
  assert.equal(r(0, 2, 0), 'Bot wins 2–0')
  assert.equal(r(1, 1, 1), 'Draw')
  assert.equal(r(0, 0, 3), 'Draw')
  assert.equal(r(1, 0, 2), 'terronk wins 1–0–2')
  assert.equal(r(1, 0, 0), 'Not a final score', 'Bo3 at 1–0 is still being played')
  assert.equal(r(2, 0, 1), 'Not a final score', 'a decided match records no draws')
  assert.equal(r(2, 2, 0), 'Not a final score')
  assert.equal(r(1, 1, 1, 3, 'elimination'), 'Needs a winner')
  assert.equal(r(1, 0, 0, 1), 'terronk wins 1–0')
  assert.equal(r(0, 0, 1, 1), 'Draw')
  assert.equal(r(0, 0, 0, 1), 'Not a final score')
})

test('fix result: every valid tally saves through the host override as the same result', () => {
  for (const bestOf of [1, 3] as const) for (const stage of ['swiss', 'elimination'] as const) {
    const need = bestOf === 1 ? 1 : 2
    for (let p1 = 0; p1 <= need; p1++) for (let p2 = 0; p2 <= need; p2++) for (let draws = 0; draws <= bestOf; draws++) {
      const result = tallyResult({p1, p2, draws}, bestOf, stage)
      if (!result) continue
      const saved = overrideGames(result.player1Wins, result.player2Wins, bestOf, stage)
      assert.equal(saved.winner, result.winner, `${p1}-${p2}-${draws} Bo${bestOf} ${stage}`)
      assert.deepEqual(tallyOf(saved.games, bestOf), {p1, p2, draws}, 'what is stored reads back as what was entered')
    }
  }
})
