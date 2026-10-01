import { it } from 'node:test'
import assert from 'node:assert/strict'
import { nativeConfig, terminalOutcome, validateLaunchUrl, createRuntime, type NativeConfig } from './runtimeClient'
it('native launch is disabled unless explicitly enabled and fully configured', () => {
  assert.throws(() => nativeConfig({}), /disabled/)
  assert.throws(() => nativeConfig({ PTP_NATIVE_PLAY_ENABLED: 'true' }), /configuration/)
})
it('rejects non-allowlisted gateway launch destinations', () => {
  assert.throws(() => validateLaunchUrl('https://attacker.invalid/launch', 'https://play.example.com'), /destination/)
  assert.equal(validateLaunchUrl('https://play.example.com/launch?code=abc', 'https://play.example.com'), 'https://play.example.com/launch?code=abc')
})
it('never infers a winner from a running match or malformed terminal response', () => {
  assert.equal(terminalOutcome({ status: 'active', returns: [1, -1] }), null)
  assert.throws(() => terminalOutcome({ status: 'complete', returns: [] }), /terminal/)
})
it('records absolute seat results from authoritative concession utilities', () => {
  assert.equal(terminalOutcome({ status: 'complete', returns: [-1, 1] }), 'player2')
  assert.equal(terminalOutcome({ status: 'complete', returns: [1, -1] }), 'player1')
  assert.equal(terminalOutcome({ status: 'complete', returns: [0, 0] }), 'draw')
})

it('only a definitive create400 is classified as rejected; uncertain outcomes retain retry semantics',async()=>{
  const previous=globalThis.fetch
  const config={baizeUrl:'http://runtime.invalid',baizeKey:'secret'} as NativeConfig
  try {
    for(const status of [400,409,503]) {
      globalThis.fetch=async()=>new Response('{}',{status})
      await assert.rejects(createRuntime(config,'match',[]),{code:status===400?'runtime_rejected':'runtime_unavailable'})
    }
    globalThis.fetch=async()=>{throw new Error('network interrupted')}
    await assert.rejects(createRuntime(config,'match',[]),/network interrupted/)
  }finally{globalThis.fetch=previous}
})
