import { trackSoloFinalization } from '@/src/services/sealed/soloTracking'
import { requireAuth } from '@/lib/auth'
import { withTransaction } from '@/lib/db'
import { prepareSoloGeneration, finalizeSoloGeneration, SoloGenerationError } from '@/src/services/sealed/soloGeneration'

export async function POST(request: Request) {
  try {
    const origin=process.env.PTP_PUBLIC_ORIGIN || new URL(request.url).origin
    if(request.headers.get('origin')!==origin)return Response.json({error:'Request origin is not allowed.'},{status:403})
    const session=requireAuth(request)
    const reader=request.body?.getReader();if(!reader)throw new SoloGenerationError(400,'Request body is required.')
    const chunks:Uint8Array[]=[];let length=0
    while(true){const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>4096){await reader.cancel();throw new SoloGenerationError(413,'Request is too large.')}chunks.push(next.value)}
    let input:Record<string,unknown>
    try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!input||typeof input!=='object'||Array.isArray(input))throw new Error()}catch{throw new SoloGenerationError(400,'Invalid JSON object.')}
    const {action,...payload}=input
    if(action!=='prepare'&&action!=='finalize')throw new SoloGenerationError(400,'Choose prepare or finalize.')
    const result=await withTransaction(async tx=>{
      const user=await tx.queryRow('SELECT auth_version,is_admin,is_beta_tester FROM users WHERE id=$1 FOR UPDATE',[session.id])
      if(!user||user.auth_version!==session.auth_version)throw new SoloGenerationError(401,'Sign in again to create a saved pool.')
      return action==='prepare'?prepareSoloGeneration(tx,session.id,payload,{is_admin:user.is_admin===true,is_beta_tester:user.is_beta_tester===true}):finalizeSoloGeneration(tx,session.id,payload)
    })
    if ('newlyCreated' in result) {
      void trackSoloFinalization(result, String(payload.generationId), session.id, typeof payload.flowId === 'string' ? payload.flowId : null)
      const { newlyCreated: _newlyCreated, ...publicResult } = result
      return Response.json(publicResult,{headers:{'cache-control':'no-store'}})
    }
    return Response.json(result,{headers:{'cache-control':'no-store'}})
  }catch(error){
    const status=error instanceof SoloGenerationError?error.status: error instanceof Error&&/unauthorized|authentication required/i.test(error.message)?401:503
    return Response.json({error:error instanceof SoloGenerationError||status===401?(error as Error).message:'Pool generation is temporarily unavailable. Retry safely.'},{status,headers:{'cache-control':'no-store'}})
  }
}
