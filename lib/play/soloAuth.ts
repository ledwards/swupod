import {requireBetaAccess} from '../auth'
import {nativeSession} from '../../src/services/play/native/http'
import {PtpPlayError} from '../../src/services/play/playState'
export async function soloSession(request:Request,mutation=false){
 await nativeSession(request,mutation)
 try{return await requireBetaAccess(request)}catch{throw new PtpPlayError(403,'beta_required','AI play is available to beta users only.')}
}
