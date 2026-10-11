import {test} from 'node:test'
import assert from 'node:assert/strict'
import {afterDraftOf, playSetupPath, poolPlayRoute} from './playSetup'

test('play deep links open the Play page at /play, preselected', () => {
  assert.equal(playSetupPath({}), '/play')
  assert.equal(playSetupPath({format: 'eternal'}), '/play?format=eternal')
  assert.equal(playSetupPath({format: 'premier'}), '/play?format=premier')
  assert.equal(playSetupPath({limited: 'draft', set: 'sor'}), '/play?format=draft&set=SOR')
  assert.equal(playSetupPath({limited: 'six', set: 'HMW'}), '/play?format=sealed&set=HMW')
  assert.equal(playSetupPath({limited: 'eight', set: 'HMW'}), '/play?format=sealed&limited=eight&set=HMW')
  assert.equal(playSetupPath({format: 'limited', limited: 'chaos'}), '/play?format=sealed&limited=chaos')
  assert.equal(playSetupPath({pool: 'abc 123', format: 'eternal'}), '/play?pool=abc+123')
  assert.equal(playSetupPath({pool: 'p1', limited: 'eight', set: 'hmw'}), '/play?format=sealed&limited=eight&set=HMW&pool=p1')
  assert.equal(playSetupPath(new URLSearchParams('invite=tok&pool=x')), '/play?invite=tok')
  assert.equal(playSetupPath({set: '../x', limited: 'draft'}), '/play?format=draft')
  assert.equal(playSetupPath({format: ['eternal', 'premier']}), '/play?format=eternal')
})

test('the pod after-draft choice reads the host rules first, then Create a Pod', () => {
  assert.equal(afterDraftOf({afterDraft: 'none'}), 'none')
  assert.equal(afterDraftOf(JSON.stringify({afterDraft: 'just_draft'})), 'none')
  assert.equal(afterDraftOf({afterDraft: 'none', tournament: {format: 'swiss'}}), 'swiss')
  assert.equal(afterDraftOf({afterDraft: 'elimination'}), 'elimination')
  assert.equal(afterDraftOf({}), undefined)
  assert.equal(afterDraftOf(null), undefined)
})

test('Play after deckbuilding: solo and None go to the Play tab with the deck, Swiss and Bracket to the pod', () => {
  const sealed = {pool_type: 'sealed', set_code: 'HMW', pod_id: null, pack_count: 8}
  assert.deepEqual(poolPlayRoute('b1', sealed, true), {redirect: '/play?format=sealed&limited=eight&set=HMW&pool=b1'})
  assert.deepEqual(poolPlayRoute('b1', {...sealed, pack_count: 6}, true), {redirect: '/play?format=sealed&set=HMW&pool=b1'})
  assert.deepEqual(poolPlayRoute('b1', sealed, false), {redirect: '/play?pool=b1'})
  const pod = {pool_type: 'draft', set_code: 'SOR', pod_id: 'x', pod_share_id: 'pod1', pack_count: 3, competitive: false}
  assert.deepEqual(poolPlayRoute('d1', {...pod, settings: {isSolo: true}}, true), {redirect: '/play?format=draft&set=SOR&pool=d1'})
  assert.deepEqual(poolPlayRoute('d1', {...pod, settings: {afterDraft: 'none'}}, true), {redirect: '/play?format=draft&set=SOR&pool=d1'})
  assert.deepEqual(poolPlayRoute('d1', {...pod, settings: {afterDraft: 'none'}, competitive: true}, true), {redirect: '/play?format=draft&set=SOR&pool=d1'})
  assert.deepEqual(poolPlayRoute('d1', {...pod, settings: {afterDraft: 'swiss'}}, true), {redirect: '/draft/pod1/pod'})
  assert.deepEqual(poolPlayRoute('d1', {...pod, settings: {afterDraft: 'elimination'}}, true), {redirect: '/draft/pod1/pod'})
  assert.deepEqual(poolPlayRoute('d1', {...pod, settings: {afterDraft: 'swiss'}, competitive: true}, true), {competitive: true})
  // Pods from before the choice count as None (Play tab with the deck); competitive keeps its Swiss page.
  assert.deepEqual(poolPlayRoute('d1', {...pod, settings: {}, competitive: true}, true), {competitive: true})
  assert.deepEqual(poolPlayRoute('d1', {...pod, settings: {}}, true), {redirect: '/play?format=draft&set=SOR&pool=d1'})
  // Everyone else keeps today's routes.
  assert.deepEqual(poolPlayRoute('d1', {...pod, settings: {afterDraft: 'none'}}, false), {redirect: '/draft/pod1/pod'})
  assert.deepEqual(poolPlayRoute('s1', {pool_type: 'sealed', pod_id: 'y', pod_share_id: 'sp'}, true), {redirect: '/sealed/sp/pod'})
  assert.deepEqual(poolPlayRoute('z', null, true), {redirect: '/play?pool=z'})
})
