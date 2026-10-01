import {describe,it} from 'node:test'
import assert from 'node:assert/strict'
import {postOpenGame,joinOpenGame} from './openGames'

describe('external listing admission after native retirement',()=>{
  it('rejects public and private listings before accessing a pool',async()=>{
    for(const visibility of ['public','private'] as const)await assert.rejects(postOpenGame({userId:'unused',poolId:'unused',visibility}),{status:410,code:'legacy_play_retired'})
  })
  it('rejects all explicit and retry joins; external tables cannot admit new players',async()=>{
    await assert.rejects(joinOpenGame({userId:'unused',poolId:'unused',shareId:'old-link'}),{status:410,code:'legacy_play_retired'})
  })
})
// Existing-game cancellation/result coverage remains in openGameLive.test.ts.
// Migration103/preservation coverage is in play/legacyRetirement.db.test.ts.
