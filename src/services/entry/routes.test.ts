import {test} from 'node:test'
import assert from 'node:assert/strict'
import {NextRequest} from 'next/server'
import {proxy} from '../../../proxy'

test('legacy bookmarks retain their URLs for the public rollout',t=>{
 const prior=process.env.PTP_NATIVE_PLAY_ENABLED;process.env.PTP_NATIVE_PLAY_ENABLED='true';t.after(()=>{if(prior===undefined)delete process.env.PTP_NATIVE_PLAY_ENABLED;else process.env.PTP_NATIVE_PLAY_ENABLED=prior})
 for(const [old] of [
  ['/pool/abc/deck/build','/pools/abc/deck/build'],
  ['/draft_pool/abc','/pools/abc'],
  ['/sealed_pool/abc','/pools/abc'],
  ['/play?pool=abc&filter=draft','/pools/abc/play?filter=draft'],
  ['/play/native?invite=invitation&view=table','/lobbies/invitation?view=table'],
  ['/play/native?match=match-id','/matches/match-id'],
  ['/play/runtime/game-id/replay','/games/game-id/replay'],
 ] as const){const response=proxy(new NextRequest(`http://localhost:3000${old}`));assert.equal(response.headers.get('location'),null)}
})
test('canonical routes and API URLs never enter redirect loops',()=>{
 for(const path of ['/pools/abc/deck','/runs/abc','/api/pools/abc','/lobbies/token','/games/abc'])assert.equal(proxy(new NextRequest(`http://localhost:3000${path}`)).headers.get('location'),null)
})
