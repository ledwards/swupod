import { test } from 'node:test'
import assert from 'node:assert/strict'
import { podLaunchOptions } from './podGames'
import { soloBestOfThree } from '../../../lib/play/soloEvent'

test('a Bo3 pod table launches as a best-of-three session that returns to the pod', () => {
  assert.deepEqual(podLaunchOptions('Ab c', 'swiss', 3), { isolated: true, returnPath: '/draft/Ab%20c/pod', eventFormat: 'swiss', bestOfThree: true })
  assert.equal(podLaunchOptions('pod', 'elimination', 3).eventFormat, 'elimination')
  // Bo1 is unchanged: one game, then back to the pod.
  assert.equal(podLaunchOptions('pod', 'swiss', 1).bestOfThree, false)
})

test('solo runs sideboard at the table when the match is best of three', () => {
  assert.equal(soloBestOfThree({ prepared: { eventFormat: 'swiss' } }), true)
  assert.equal(soloBestOfThree({ prepared: JSON.stringify({ matchBestOf: 3 }) }), true)
  assert.equal(soloBestOfThree({ prepared: { matchBestOf: 1 } }), false)
  assert.equal(soloBestOfThree({ prepared: { singleGame: true } }), false)
  assert.equal(soloBestOfThree({ prepared: { singleGame: true }, best_of_three: true }), true)
})
