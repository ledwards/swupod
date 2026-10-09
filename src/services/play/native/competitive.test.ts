import {test} from 'node:test'
import assert from 'node:assert/strict'
import {liveGameAction} from '../../../components/MatchmakingPanel.helpers'
import {isStalePracticeGame} from '../../matchmaking/liveGames'

test('native Swiss participants can play and rejoin without Companion',()=>{
 const match:any={id:'m',player1:{id:'a'},player2:{id:'b'},currentGame:{status:'in_progress'}}
 assert.equal(liveGameAction({match,currentUserId:'b',liveLaunchEnabled:true,nativeLaunch:true} as any).disabled,false)
 assert.notEqual(liveGameAction({match,currentUserId:'outsider',liveLaunchEnabled:true,nativeLaunch:true} as any).kind,'play')
 assert.notEqual(liveGameAction({match:{...match,finalConfirmed:true},currentUserId:'b',liveLaunchEnabled:true,nativeLaunch:true} as any).kind,'play')
})
test('native Swiss reservations are recovered from the runtime, never timed out as missing Companion lobbies',()=>{
 assert.equal(isStalePracticeGame({gameNumber:1,status:'in_progress',lifecycleIdempotencyKey:'purrgil:game',startedAt:'2020-01-01'}, {now:new Date(),staleAfterMs:1}),false)
})
