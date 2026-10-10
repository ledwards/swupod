import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDraftRefresh } from './draftRefresh'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('a burst of draft broadcasts shares a fresh trailing read, not an old in-flight snapshot', async () => {
  const reads: ReturnType<typeof deferred<number>>[] = []
  const refresh = createDraftRefresh(() => {
    const read = deferred<number>(); reads.push(read); return read.promise
  })
  const initial = refresh()
  const afterSelection = Array.from({ length: 16 }, () => refresh())
  assert.equal(reads.length, 1, 'never overlap full draft reads')
  reads[0]!.resolve(1)
  assert.equal(await initial, 1)
  assert.equal(reads.length, 2, 'selection needs a read begun after the mutation')
  reads[1]!.resolve(2)
  assert.deepEqual(await Promise.all(afterSelection), Array(16).fill(2))
  const later = refresh()
  assert.equal(reads.length, 3)
  reads[2]!.resolve(3)
  assert.equal(await later, 3)
})

test('a failed read rejects its caller without dropping queued refreshes', async () => {
  const first = deferred<number>(), second = deferred<number>()
  let calls = 0
  const refresh = createDraftRefresh(() => ++calls === 1 ? first.promise : second.promise)
  const initial = refresh(), queued = refresh()
  const failure = assert.rejects(initial, /network failed/)
  first.reject(new Error('network failed'))
  await failure
  assert.equal(calls, 2)
  second.resolve(2)
  assert.equal(await queued, 2)
})
