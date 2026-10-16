// Spec: /maintenance must render for everyone, whatever the alpha check does.
// Alpha viewers get the themed page only when the check answers true in time;
// a throw, a rejection, a hang or a non-boolean answer means the legacy page.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { alphaOrLegacy } from './alphaFallback'

describe('alphaOrLegacy', () => {
  it('passes a true answer through', async () => {
    assert.equal(await alphaOrLegacy(async () => true), true)
  })

  it('passes a false answer through', async () => {
    assert.equal(await alphaOrLegacy(async () => false), false)
  })

  it('falls back to legacy when the check rejects (no session, database down)', async () => {
    assert.equal(await alphaOrLegacy(async () => { throw new Error('no database') }), false)
  })

  it('falls back to legacy when the check throws synchronously', async () => {
    assert.equal(await alphaOrLegacy(() => { throw new Error('headers unavailable') }), false)
  })

  it('falls back to legacy when the check hangs past the timeout', async () => {
    const started = Date.now()
    const answer = await alphaOrLegacy(() => new Promise<boolean>(() => {}), 50)
    assert.equal(answer, false)
    assert.ok(Date.now() - started < 1000, 'must not wait on a hung check')
  })

  it('treats a non-boolean answer as legacy', async () => {
    assert.equal(await alphaOrLegacy(async () => 'yes' as unknown as boolean), false)
  })
})
