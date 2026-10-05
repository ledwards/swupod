import {requireAlphaAccess} from '../auth'
import {nativeSession} from '../../src/services/play/native/http'
import {PtpPlayError} from '../../src/services/play/playState'
export async function soloSession(request:Request,mutation=false){
 await nativeSession(request,mutation)
 try{return await requireAlphaAccess(request)}catch{throw new PtpPlayError(403,'alpha_required','AI play is available to alpha testers only.')}
}
