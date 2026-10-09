import { redirect } from 'next/navigation'
import PlayHomepage from '../../../src/components/PlayHomepage'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'

/** The nested lobby views exist only on the alpha homepage; everyone else lands on the current lobby. */
export default async function LobbyPage({params,searchParams}:{params:Promise<{view:string[]}>;searchParams:Promise<{format?:string}>}){
 if(!(await viewerHasAlphaAccess()))redirect('/lobby')
 const {view}=await params,{format}=await searchParams
 const path=`/lobby/${view.join('/')}${view[0]==='constructed'&&format==='eternal'?'?format=eternal':''}`
 return <PlayHomepage path={path}/>
}
