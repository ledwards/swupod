import {getSession,SHARED_SESSION_COOKIE,clearSession} from '@/lib/auth'
const allowed=/^\/api\/lobby(?:\/(?:shared|decks\/played|import-url|ratings\/reset|logout|melee(?:\/[^/]+)?|matches\/[a-zA-Z0-9-]+\/(?:replay|recording)))?$/
/** Same-site gateway adapter. The browser cannot choose a host or identity. */
async function relay(request:Request){
 const url=new URL(request.url)
 if(!allowed.test(url.pathname)&&!/^\/api\/(entitlements|cosmetics|appearances)$/.test(url.pathname))return Response.json({error:{message:'Not found'}},{status:404})
 if(request.method!=='GET'&&request.headers.get('origin')!==url.origin)return Response.json({error:{message:'Invalid request origin'}},{status:403})
 const origin=process.env.PURRGIL_PUBLIC_ORIGIN||'https://play.protectthepod.com'
 const headers=new Headers({'accept':request.headers.get('accept')||'application/json','origin':origin})
 const session=getSession(request)
 if(session){const cookie=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(`${SHARED_SESSION_COOKIE}=`));if(cookie)headers.set('cookie',cookie)}
 if(request.method!=='GET')headers.set('content-type','application/json')
 const upstream=await fetch(new URL(url.pathname+url.search,origin),{method:request.method,headers,...(request.method==='GET'?{}:{body:await request.text()}),redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(30000)})
 const out=new Headers({'cache-control':'no-store','content-type':upstream.headers.get('content-type')||'application/json'})
 const destination=upstream.headers.get('location');if(destination)out.set('location',new URL(destination,origin).href)
 const disposition=upstream.headers.get('content-disposition');if(disposition)out.set('content-disposition',disposition)
 let body:BodyInit|null=upstream.body
 if(upstream.headers.get('content-type')?.includes('application/json')){
  const data=await upstream.json()
  // Game and spectator routes belong to the runtime host, not the PTP website.
  for(const entry of [data.active,...(data.games??[]),...(data.history??[])])if(entry?.url)entry.url=new URL(entry.url,origin).href
  body=JSON.stringify(data)
 }
 const response=new Response(body,{status:upstream.status,headers:out})
 return url.pathname.endsWith('/logout')&&upstream.ok?clearSession(response):response
}
export const GET=relay
export const POST=relay
