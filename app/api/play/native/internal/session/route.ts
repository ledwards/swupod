import {verifyToken} from '@/lib/auth'
import {queryRow} from '@/lib/db'
import {authorizeRecordService} from '@/src/services/play/native/gameRecords'
import {body,respond} from '@/src/services/play/native/http'
import {PtpPlayError} from '@/src/services/play/playState'

/** Only the trusted gateway can introspect a PTP browser session. */
export function POST(request:Request){return respond(async()=>{
 authorizeRecordService(request)
 const input=await body(request,8192)
 const session=typeof input.token==='string'?verifyToken(input.token):null
 if(!session?.id||!session.exp||typeof session.auth_version!=='number')throw new PtpPlayError(401,'session_expired','Sign in again.')
 const user=await queryRow('SELECT id,username,avatar_url,auth_version FROM users WHERE id=$1',[session.id])
 if(!user||Number(user.auth_version)!==session.auth_version)throw new PtpPlayError(401,'session_expired','Sign in again.')
 return {subject:String(user.id),name:String(user.username),avatarUrl:user.avatar_url??null,expiresAt:session.exp*1000}
})}
