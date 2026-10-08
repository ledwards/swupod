type Dependencies={publicOrigin?:string|undefined;authenticate:(request:Request)=>{id:string};discordForUser:(id:string)=>Promise<unknown>;call:(discordId:string,input:Record<string,unknown>)=>Promise<{status:number;data:Record<string,unknown>}>}
export function createMeleeConnectionHandler(deps:Dependencies) {
  return async(request:Request,mutation:boolean)=>{
    try {
      const session=deps.authenticate(request)
      if(mutation&&request.headers.get('origin')!==(deps.publicOrigin??new URL(request.url).origin))return Response.json({error:'Invalid request origin.'},{status:403})
      const discordId=await deps.discordForUser(session.id)
      if(typeof discordId!=='string'||!/^\d{17,20}$/.test(discordId))return Response.json({error:'Sign in with Discord to connect Melee.'},{status:401})
      let input:Record<string,unknown>={action:'status'}
      if(mutation) {
        const raw=await request.text()
        if(raw.length>2048)return Response.json({error:'Request too large.'},{status:413})
        let body:Record<string,unknown>
        try{body=JSON.parse(raw)}catch{return Response.json({error:'Invalid request.'},{status:400})}
        if(!body||!['begin','verify','disconnect','erase'].includes(String(body.action)))return Response.json({error:'Unknown action.'},{status:400})
        input={action:body.action,handle:body.handle,challengeId:body.challengeId,noticeVersion:body.noticeVersion}
      }
      const result=await deps.call(discordId,input)
      return Response.json(result.data,{status:result.status,headers:{'Cache-Control':'no-store'}})
    } catch(error) {
      const unauthorized=error instanceof Error&&error.message==='Unauthorized'
      return Response.json({error:unauthorized?'Sign in with Discord to connect Melee.':'Could not check your Melee connection. Try again.'},{status:unauthorized?401:503})
    }
  }
}
