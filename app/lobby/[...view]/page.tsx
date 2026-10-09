import PlayHomepage from '../../../src/components/PlayHomepage'
export default async function LobbyPage({params,searchParams}:{params:Promise<{view:string[]}>;searchParams:Promise<{format?:string}>}){
 const {view}=await params,{format}=await searchParams
 const path=`/lobby/${view.join('/')}${view[0]==='constructed'&&format==='eternal'?'?format=eternal':''}`
 return <PlayHomepage path={path}/>
}
