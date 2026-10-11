import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveLeaderPick } from './leaderPick'
import { createStrategy } from '../bots/behaviors/index'
import type { RawCard } from './cardData'

const L = (name: string, instanceId: string, aspects: string[] = ['Vigilance', 'Heroism']) => ({ id: `id-${name}`, instanceId, name, type: 'Leader', subtitle: null, aspects, isLeader: true, set: 'HMW' })
const jarjar = L('Jar Jar Binks', 'jj_336'), poggle = L('Poggle the Lesser', 'pg_304', ['Aggression', 'Villainy']), wicket = L('Wicket', 'wk_320', ['Aggression', 'Heroism'])

test('a staged leader in the pack is the pick', () => {
  assert.equal(resolveLeaderPick([poggle, wicket], 'wk_320', [jarjar]), 1)
})

test('a selection from the pack before it rotated still takes a leader: never a lost pick (oCFdREn8 seat 8)', () => {
  // Seat 8 staged from its old pack (Warrior/Hemlock) after the packs rotated to Poggle/Wicket.
  assert.equal(resolveLeaderPick([poggle, wicket], 'hemlock_368', [jarjar]), 0)
  assert.equal(resolveLeaderPick([poggle, wicket], null, [jarjar]), 0)
  assert.equal(resolveLeaderPick([], 'x', [jarjar]), -1)
})

test('the fallback avoids a leader the drafter owns, and takes a duplicate only when nothing else is left', () => {
  const jj2 = L('Jar Jar Binks', 'jj_16')
  assert.equal(resolveLeaderPick([jj2, wicket], 'gone', [jarjar]), 1)
  assert.equal(resolveLeaderPick([jj2], 'gone', [jarjar]), 0)
})

test('every bot strategy always takes a leader, a duplicate only when the pack holds nothing else', () => {
  for (const name of ['tournamentPlayer', 'topPlayer', 'allPlayer', 'diversity', 'nemesis', 'primaryColorCorner', 'secondaryAspectCorner']) {
    const s = createStrategy(name)
    const onlyDupes = s.selectLeader([L('Jar Jar Binks', 'jj_16')] as unknown as RawCard[], { draftedLeaders: [jarjar] as unknown as RawCard[], setCode: 'HMW' })
    assert.equal(onlyDupes?.instanceId, 'jj_16', `${name}: takes the duplicate when it is all that is left`)
    const mixed = s.selectLeader([L('Jar Jar Binks', 'jj_16'), poggle] as unknown as RawCard[], { draftedLeaders: [jarjar] as unknown as RawCard[], setCode: 'HMW' })
    assert.equal(mixed?.instanceId, 'pg_304', `${name}: takes the other leader over a duplicate`)
  }
})
