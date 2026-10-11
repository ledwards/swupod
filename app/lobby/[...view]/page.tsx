import { redirect } from 'next/navigation'
import PlayHomepage from '../../../src/components/PlayHomepage'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'

/** The nested lobby views exist only on the alpha homepage; everyone else lands on the current lobby. Play moved to /play. */
export default async function LobbyPage({params,searchParams}:{params:Promise<{view:string[]}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 if(!(await viewerHasAlphaAccess()))redirect('/lobby')
 const {view}=await params,query=await searchParams
 if(view[0]==='constructed'){
  const q=new URLSearchParams()
  for(const [key,value] of Object.entries(query))for(const v of [value??[]].flat())q.append(key,v)
  redirect(q.size?`/play?${q}`:'/play')
 }
 return <PlayHomepage path={`/lobby/${view.join('/')}`}/>
}
