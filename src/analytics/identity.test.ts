import {test} from 'node:test'
import assert from 'node:assert/strict'
import {syncAnalyticsIdentity} from './identity'
function client(identified = false) {
  const calls: string[] = []
  return {calls, get_property: () => identified ? 'discord-old' : undefined,
    reset: () => calls.push('reset'), identify: (id: string) => calls.push(`identify:${id}`),
    register: (props: unknown) => calls.push(`register:${JSON.stringify(props)}`)}
}
test('anonymous reloads retain their visitor identity', () => {
  const sdk = client()
  syncAnalyticsIdentity(sdk, null, false)
  syncAnalyticsIdentity(sdk, null, false)
  assert.equal(sdk.calls.includes('reset'), false)
})
test('auth loading never resets a signed-in visitor', () => {
  const sdk = client(true)
  syncAnalyticsIdentity(sdk, null, true)
  assert.deepEqual(sdk.calls, [])
})
test('logout resets identity and restores production segmentation', () => {
  const sdk = client(true)
  syncAnalyticsIdentity(sdk, null, false)
  assert.deepEqual(sdk.calls, ['reset', 'register:{"surface":"swupod","environment":"production"}'])
})
test('login uses the canonical Discord identity', () => {
  const sdk = client()
  syncAnalyticsIdentity(sdk, {id:'uuid',discord_id:'123'}, false)
  assert.equal(sdk.calls[0], 'identify:discord-123')
})
