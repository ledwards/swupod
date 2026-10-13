import {test} from 'node:test'
import assert from 'node:assert/strict'
import {GET,POST} from './route'

test('host adapter keeps live games and replays on Purrgil and downloads on the authenticated adapter',async()=>{
 const old=globalThis.fetch,oldOrigin=process.env.PURRGIL_PUBLIC_ORIGIN
 process.env.PURRGIL_PUBLIC_ORIGIN='https://game.example.test'
 globalThis.fetch=async()=>Response.json({active:{url:'/table/one'},games:[{url:'/spectate/one'}],history:[{replayUrl:'/replay/one',recordingUrl:'/api/lobby/matches/one/recording'}]})
 try {
  const response=await GET(new Request('https://host.example.test/api/lobby'))
  const data=await response.json()
  assert.equal(data.active.url,'https://game.example.test/table/one')
  assert.equal(data.games[0].url,'https://game.example.test/spectate/one')
  assert.equal(data.history[0].replayUrl,'https://game.example.test/replay/one')
  assert.equal(data.history[0].recordingUrl,'/api/lobby/matches/one/recording')
  assert.equal(response.headers.get('cache-control'),'no-store')
  assert.equal((await GET(new Request('https://host.example.test/api/lobby/unknown'))).status,404)
  assert.equal((await POST(new Request('https://host.example.test/api/lobby/reservation',{method:'POST',headers:{origin:'https://untrusted.example.test'}}))).status,403)
 } finally {globalThis.fetch=old;if(oldOrigin===undefined)delete process.env.PURRGIL_PUBLIC_ORIGIN;else process.env.PURRGIL_PUBLIC_ORIGIN=oldOrigin}
})
