import {nativeConfig} from './runtimeClient'
import {PtpPlayError} from '../playState'
/** Server-only bridge: the browser can never choose its subject. */
export async function sharedRemote(subject:string,action:string,input:Record<string,unknown>={}) {
 const config=nativeConfig(process.env,true)
 const response=await fetch(`${config.gatewayUrl}/internal/lobby/shared`,{method:'POST',headers:{authorization:`Bearer ${config.gatewayKey}`,'content-type':'application/json'},body:JSON.stringify({...input,issuer:'ptp',subject,action}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)})
 const value=await response.json()
 if(!response.ok)throw new PtpPlayError(response.status,'shared_play_error',typeof value.error==='string'?value.error:value.error?.message??'The play service is unavailable. Retry safely.')
 return value
}
