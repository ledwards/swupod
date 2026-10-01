import {test} from 'node:test'
import assert from 'node:assert/strict'
import {legacyPlayRetired} from './legacyRetirement'
import {enterLimitedQueue} from './playLedger'
import {postOpenGame,joinOpenGame} from '../openGames'
test('retired external admission fails before any database or runtime work',async()=>{
  await assert.rejects(enterLimitedQueue({userId:'never-load',poolShareId:'never-load'}),{code:'legacy_play_retired',status:410})
  await assert.rejects(postOpenGame({userId:'never-load',poolId:'never-load'}),{code:'legacy_play_retired',status:410})
  await assert.rejects(joinOpenGame({userId:'never-load',poolId:'never-load',shareId:'never-load'}),{code:'legacy_play_retired',status:410})
})
test('retired discovery explicitly directs stale clients to native play',async()=>{
  const response=legacyPlayRetired();assert.equal(response.status,410)
  assert.equal((await response.json()).playUrl,'/play')
  assert.equal(response.headers.get('cache-control'),'no-store')
})
test('legacy routes return 410 without upstream polling or launch metadata',async()=>{
  const original=globalThis.fetch
  let calls=0
  globalThis.fetch=async()=>{calls++;throw new Error('Unexpected upstream request')}
  try{
    const routes=await Promise.all([
      import('../../../app/api/karabast/lobbies/route'),
      import('../../../app/api/play/lobby/route'),
      import('../../../app/api/plugin/v1/play/[format]/[shareId]/route'),
      import('../../../app/api/open-games/route'),
      import('../../../app/api/open-games/eligible-decks/route'),
    ])
    for(const route of routes)assert.equal((await route.GET()).status,410)
    assert.equal((await import('../../../app/api/play/queue/route')).POST().status,410)
    assert.equal((await import('../../../app/api/open-games/[shareId]/join/route')).POST().status,410)
    assert.equal(calls,0)
  }finally{globalThis.fetch=original}
})
