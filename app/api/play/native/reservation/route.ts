import {nativeSession,respond,body,uuid} from '@/src/services/play/native/http'
import {nativeReservation,resolveNativeReservation} from '@/src/services/play/native/reservationRecovery'
export function GET(request:Request){return respond(async()=>({reservation:await nativeReservation((await nativeSession(request)).id)}))}
export function POST(request:Request){return respond(async()=>{const user=await nativeSession(request,true),input=await body(request);return resolveNativeReservation(user.id,uuid(input.matchId),input.action)})}
