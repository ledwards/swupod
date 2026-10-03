import { it } from 'node:test'
import assert from 'node:assert/strict'
import { nativeConfig, terminalOutcome, validateLaunchUrl, createRuntime, issueLaunch, authorizeHandoff, type NativeConfig } from './runtimeClient'
it('native launch is disabled unless explicitly enabled and fully configured', () => {
  assert.throws(() => nativeConfig({}), /disabled/)
  assert.throws(() => nativeConfig({ PTP_NATIVE_PLAY_ENABLED: 'true', PTP_BETA_EXPERIENCE_ENABLED:'true' }), /configuration/)
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

it('AI match creation pins the bot policy while ordinary matches stay human', async () => {
 const calls: unknown[] = []
 const original = globalThis.fetch
 globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
  calls.push(JSON.parse(String(init?.body)))
  return Response.json({matchId:'test'})
 }) as typeof fetch
 try {
  const {createRuntime} = await import('./runtimeClient')
  const config = {baizeUrl:'http://localhost:4331',baizeKey:'test'} as Parameters<typeof createRuntime>[0]
  const deck = {leader:'SOR_001',base:'SOR_020',deck:[{id:'SOR_100',count:30}]}
  await createRuntime(config,'test',[deck,deck],[null,'wip-search-v1'])
  await createRuntime(config,'test-human',[deck,deck])
  assert.deepEqual((calls[0] as {bots:unknown}).bots,[null,'wip-search-v1'])
  assert.equal('bots' in (calls[1] as object),false)
 } finally { globalThis.fetch = original }
})

it('production keeps browser origins HTTPS while permitting private service HTTP',()=>{
 const env={NODE_ENV:'production',BAIZE_PVP_URL:'http://baize.railway.internal:4331',BAIZE_PVP_SERVICE_KEY:'key',PURRGIL_INTERNAL_URL:'http://purrgil.railway.internal:4397',PURRGIL_HOST_SERVICE_KEY:'key',PURRGIL_PUBLIC_ORIGIN:'https://play.example.com',PTP_PUBLIC_ORIGIN:'https://www.example.com',PTP_NATIVE_INVITE_KEY:'key',PTP_NATIVE_SUPPORT_PATH:'/support.json'};
 assert.equal(nativeConfig(env,true).baizeUrl,env.BAIZE_PVP_URL);
 for(const field of ['PURRGIL_PUBLIC_ORIGIN','PTP_PUBLIC_ORIGIN'])assert.throws(()=>nativeConfig({...env,[field]:'http://purrgil.railway.internal'},true),/invalid URL/);
 assert.throws(()=>nativeConfig({...env,BAIZE_PVP_URL:'http://localhost:4331'},true),/invalid URL/);
});

for (const production of [false, true]) it(`${production ? 'production' : 'development'} handoff uses private service requests and public browser redirects`, async () => {
 const original = globalThis.fetch
 const config = {
  gatewayUrl: production ? 'http://purrgil.railway.internal:4397' : 'http://127.0.0.1:4397',
  gatewayKey: 'server-only-key',
  publicOrigin: production ? 'https://play.example.com' : 'http://localhost:4397',
  hostOrigin: production ? 'https://www.example.com' : 'http://localhost:3000',
 } as NativeConfig
 const returnPath = '/limited/ai?pool=test&request=prepared'
 globalThis.fetch = (async (url, init) => {
  const body = JSON.parse(String(init?.body))
  assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer server-only-key')
  if (String(url).endsWith('/internal/launch')) {
   assert.equal(String(url), `${config.gatewayUrl}/internal/launch`)
   assert.equal(body.returnUrl, config.hostOrigin + returnPath)
   assert.equal(body.isolated, true)
   assert.equal(body.seat, 0)
   return Response.json({launchUrl: `${config.publicOrigin}/launch?code=one-use`})
  }
  assert.equal(String(url), `${config.gatewayUrl}/internal/authorize`)
  assert.equal(body.handoff, 'pending')
  return Response.json({completeUrl: `${config.publicOrigin}/complete?handoff=pending`})
 }) as typeof fetch
 try {
  const result = await issueLaunch(config, 'match', 'user', 0, Date.now() + 60000, {isolated:true, returnPath})
  assert.equal(result.launchUrl, `${config.publicOrigin}/launch?code=one-use`)
  assert.equal(await authorizeHandoff(config, 'user', 'pending'), `${config.publicOrigin}/complete?handoff=pending`)
 } finally { globalThis.fetch = original }
})
