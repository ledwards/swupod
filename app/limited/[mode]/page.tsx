import {headers} from 'next/headers'
import {redirect,notFound} from 'next/navigation'
import {getSession} from '@/lib/auth'
import {queryRow} from '@/lib/db'
export default async function Page({params,searchParams}:{params:Promise<{mode:string}>;searchParams:Promise<Record<string,string|undefined>>}) {
 const {mode}=await params, query=await searchParams
 if(!['draft','sealed','play','ai','swiss','bracket','sideboard'].includes(mode))notFound()
 const rest=new URLSearchParams(Object.entries(query).filter((entry):entry is [string,string]=>typeof entry[1]==='string'))
 let path=mode==='ai'?'/play/ai':'/play'
 if(mode==='sideboard' && query.run){path=`/runs/${encodeURIComponent(query.run)}/sideboard`;rest.delete('run')}
 else if(mode==='draft'||mode==='sealed')path=`/${mode}/setup`
 else if(query.pool){
  path=`/pools/${encodeURIComponent(query.pool)}/play${mode==='play'?'':`/${mode}`}`;rest.delete('pool')
  if(query.request && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query.request)){
   const session=getSession(new Request('http://localhost',{headers:await headers()}))
   if(session){const run=await queryRow('SELECT id FROM ptp_solo_ai_runs WHERE owner_user_id=$1 AND request_id=$2 AND pool_share_id=$3',[session.id,query.request,query.pool]);if(run){path=`/runs/${run.id}`;rest.delete('request')}}
  }
 }
 redirect(path+(rest.size?`?${rest}`:''))
}
