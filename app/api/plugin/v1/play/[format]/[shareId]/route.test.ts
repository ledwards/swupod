import {describe,it} from 'node:test'
import assert from 'node:assert/strict'
import {GET} from './route'
describe('generic Companion pool launch metadata after retirement',()=>{
  it('returns an explicit retirement response without monitoring or lobby hints',async()=>{
    const response=GET();assert.equal(response.status,410)
    const body=await response.json()
    assert.equal(body.code,'legacy_play_retired');assert.equal(body.playUrl,'/play')
    assert.equal(body.lobbyName,undefined);assert.equal(body.cardPool,undefined)
  })
})
