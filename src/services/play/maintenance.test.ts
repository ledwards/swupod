import test from 'node:test'
import assert from 'node:assert/strict'
import {assertPlayAvailable,playMaintenance} from './maintenance'
test('maintenance is off unless a message is set; the return time is optional and normalised',()=>{
 for(const env of [{},{PTP_PLAY_MAINTENANCE_MESSAGE:'   '},{PTP_PLAY_MAINTENANCE_UNTIL:'2026-10-15T20:00:00Z'}])assert.equal(playMaintenance(env as NodeJS.ProcessEnv),null)
 assert.deepEqual(playMaintenance({PTP_PLAY_MAINTENANCE_MESSAGE:' Matchmaking is being upgraded. '} as NodeJS.ProcessEnv),{message:'Matchmaking is being upgraded.',returnAt:null})
 assert.deepEqual(playMaintenance({PTP_PLAY_MAINTENANCE_MESSAGE:'Upgrading.',PTP_PLAY_MAINTENANCE_UNTIL:'2026-10-15T20:00:00+02:00'} as NodeJS.ProcessEnv),{message:'Upgrading.',returnAt:'2026-10-15T18:00:00.000Z'})
 assert.equal(playMaintenance({PTP_PLAY_MAINTENANCE_MESSAGE:'Upgrading.',PTP_PLAY_MAINTENANCE_UNTIL:'soon'} as NodeJS.ProcessEnv)?.returnAt,null)
 assert.equal(playMaintenance({PTP_PLAY_MAINTENANCE_MESSAGE:'x'.repeat(400)} as NodeJS.ProcessEnv)?.message.length,300)
})
test('play endpoints refuse with a 503 that carries the message while maintenance is on',()=>{
 assert.doesNotThrow(()=>assertPlayAvailable({} as NodeJS.ProcessEnv))
 assert.throws(()=>assertPlayAvailable({PTP_PLAY_MAINTENANCE_MESSAGE:'Back soon.'} as NodeJS.ProcessEnv),(error:any)=>error.status===503&&error.code==='maintenance'&&error.message==='Back soon.')
})
