import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitDraftedLeaders } from './leaderReveal'

const POOL = [{ name: 'Greef Karga' }, { name: 'Sabine Wren' }, { name: 'Ahsoka Tano' }]

test('a viewer who may not see the choice gets every leader on equal footing', () => {
  const result = splitDraftedLeaders({
    draftedLeaders: POOL,
    activeLeaderName: 'Greef Karga',
    reveal: false,
  })

  // The regression: Greef came back as `chosenLeader`, the seat drew him bright
  // and the other two at half opacity, and the whole table could read the pick.
  assert.equal(result.chosenLeader, null)
  assert.deepEqual(result.otherLeaders, POOL)
})

test('the seat owner still sees which leader they made active', () => {
  const result = splitDraftedLeaders({
    draftedLeaders: POOL,
    activeLeaderName: 'Sabine Wren',
    reveal: true,
  })

  assert.deepEqual(result.chosenLeader, { name: 'Sabine Wren' })
  assert.deepEqual(result.otherLeaders, [{ name: 'Greef Karga' }, { name: 'Ahsoka Tano' }])
})

test('no active leader means nothing is singled out, revealed or not', () => {
  for (const reveal of [true, false]) {
    const result = splitDraftedLeaders({ draftedLeaders: POOL, activeLeaderName: null, reveal })
    assert.equal(result.chosenLeader, null, `reveal=${reveal}`)
    assert.deepEqual(result.otherLeaders, POOL, `reveal=${reveal}`)
  }
})

test('a duplicated leader only claims the choice once', () => {
  const pool = [{ name: 'Ahsoka Tano' }, { name: 'Ahsoka Tano' }]
  const result = splitDraftedLeaders({
    draftedLeaders: pool,
    activeLeaderName: 'Ahsoka Tano',
    reveal: true,
  })

  assert.deepEqual(result.chosenLeader, { name: 'Ahsoka Tano' })
  assert.deepEqual(result.otherLeaders, [{ name: 'Ahsoka Tano' }])
})

test('an empty or missing pool is not a crash', () => {
  assert.deepEqual(
    splitDraftedLeaders({ draftedLeaders: undefined, activeLeaderName: 'X', reveal: true }),
    { chosenLeader: null, otherLeaders: [] }
  )
  assert.deepEqual(
    splitDraftedLeaders({ draftedLeaders: [], activeLeaderName: 'X', reveal: false }),
    { chosenLeader: null, otherLeaders: [] }
  )
})

test('the returned list is a copy, so callers cannot mutate the pool', () => {
  const pool = [{ name: 'Greef Karga' }]
  const result = splitDraftedLeaders({ draftedLeaders: pool, activeLeaderName: null, reveal: false })
  result.otherLeaders.push({ name: 'Injected' })
  assert.equal(pool.length, 1)
})
