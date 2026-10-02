import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
test('beta rollout preserves legacy route handlers and cross-engine admission guard',()=>{
 for(const file of ['app/api/play/lobby/route.ts','app/api/play/queue/route.ts','app/api/open-games/route.ts','app/api/open-games/[shareId]/join/route.ts','app/api/plugin/v1/play/[format]/[shareId]/route.ts']){
  assert.doesNotMatch(readFileSync(file,'utf8'),/legacyPlayRetired/)
 }
 for(const file of ['src/services/openGames.ts','src/services/play/playLedger.ts'])assert.match(readFileSync(file,'utf8'),/await rejectNativeReservation/)
})
