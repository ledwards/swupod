import {getSession,shareSession,sessionCookieToken} from '@/lib/auth'
import {nativeSession,respond} from '@/src/services/play/native/http'
import {nativeConfig,authorizeLobbyHandoff} from '@/src/services/play/native/runtimeClient'
import {PtpPlayError} from '@/src/services/play/playState'

/** A browser-bound Purrgil lobby login, independent of a game-seat grant. */
export async function GET(request:Request){
 try{
  const config=nativeConfig(process.env,true)
  const handoff=new URL(request.url).searchParams.get('request')
  if(!handoff||!/^[a-f0-9]{64}$/.test(handoff))throw new PtpPlayError(400,'invalid_handoff','Invalid lobby login.')
  if(!getSession(request)){
   const target=new URL('/api/auth/signin/discord',config.hostOrigin)
   target.searchParams.set('return_to',`/api/play/native/lobby-handoff?request=${handoff}`)
   return Response.redirect(target.href,303)
  }
  const session=await nativeSession(request)
  const destination=await authorizeLobbyHandoff(config,{id:session.id,username:session.username,avatarUrl:session.avatar_url??null,expiresAt:Math.min((session.exp??0)*1000,Date.now()+6*3600000)},handoff)
  return shareSession(new Response(null,{status:303,headers:{location:destination,'cache-control':'no-store','referrer-policy':'no-referrer'}}),sessionCookieToken(request.headers.get('cookie'))??'')
 }catch(error){return respond(async()=>{throw error})}
}
