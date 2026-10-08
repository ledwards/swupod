import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createDeckSaveQueue } from './deckSaveQueue'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

describe('deck saves on a slow connection', () => {
  it('allows one upload and coalesces edits into the latest state before Play resolves', async () => {
    const first = deferred(), last = deferred()
    const writes: unknown[] = []
    const queue = createDeckSaveQueue(async state => {
      writes.push(state)
      await (writes.length === 1 ? first.promise : last.promise)
    })
    queue.set({ deck: ['a'] })
    const autosave = queue.flush()
    queue.set({ deck: ['b'] })
    queue.set({ deck: ['c'] })
    let ready = false
    const play = queue.flush().then(() => { ready = true })
    assert.equal(writes.length, 1)
    first.resolve()
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(writes, [{ deck: ['a'] }, { deck: ['c'] }])
    assert.equal(ready, false)
    last.resolve()
    await Promise.all([autosave, play])
    assert.equal(queue.pending(), null)
    queue.set({ deck: ['c'] })
    await queue.flush()
    assert.equal(writes.length, 2, 'hydration/unmount must not resend saved state')
  })

  it('retains failed state and retries without leaving the queue stuck', async () => {
    let attempts = 0
    const queue = createDeckSaveQueue(async () => { if (++attempts === 1) throw new Error('Failed to fetch') })
    queue.set({ deck: ['a'] })
    await assert.rejects(queue.flush(), /Failed to fetch/)
    assert.deepEqual(queue.pending(), { deck: ['a'] })
    await queue.flush()
    assert.equal(queue.pending(), null)
    assert.equal(attempts, 2)
  })

  it('saves a revert made while an older edit is uploading', async () => {
    const held = deferred()
    const writes: unknown[] = []
    const queue = createDeckSaveQueue(async state => { writes.push(state); if (writes.length === 2) await held.promise })
    queue.set({ deck: ['a'] }); await queue.flush()
    queue.set({ deck: ['b'] }); const save = queue.flush()
    queue.set({ deck: ['a'] }); held.resolve(); await save
    assert.deepEqual(writes, [{ deck: ['a'] }, { deck: ['b'] }, { deck: ['a'] }])
  })

  it('retries a revert when a lost response may hide a committed write', async () => {
    const held = deferred()
    const writes: unknown[] = []
    const queue = createDeckSaveQueue(async state => {
      writes.push(state)
      if (writes.length === 2) { await held.promise; throw new Error('Response lost') }
    })
    queue.set({ deck: ['a'] }); await queue.flush()
    queue.set({ deck: ['b'] }); const save = queue.flush()
    queue.set({ deck: ['a'] }); held.resolve()
    await assert.rejects(save)
    await queue.flush()
    assert.deepEqual(writes, [{ deck: ['a'] }, { deck: ['b'] }, { deck: ['a'] }])
  })
})
