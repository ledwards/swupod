import {requireAuth} from '@/lib/auth'
import {queryRow} from '@/lib/db'
import {callMeleeRewardLink} from '@/lib/meleeRewardLink'
import {createMeleeConnectionHandler} from '@/lib/meleeConnectionHandler'
const run=createMeleeConnectionHandler({authenticate:requireAuth,discordForUser:async id=>(await queryRow('SELECT discord_id FROM users WHERE id=$1',[id]))?.discord_id,call:callMeleeRewardLink})
export const GET=(request:Request)=>run(request,false)
export const POST=(request:Request)=>run(request,true)
