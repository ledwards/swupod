import { redirect } from 'next/navigation'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'

/** The bundle's views moved to plain top-level URLs; old /lobby/<view> links land there with their query. */
const moved:Record<string,string>={constructed:'/play',history:'/history',decks:'/decks',stats:'/me',spectate:'/watch'}
export default async function LobbyPage({params,searchParams}:{params:Promise<{view:string[]}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 if(!(await viewerHasAlphaAccess()))redirect('/lobby')
 const {view}=await params,query=await searchParams
 const q=new URLSearchParams()
 for(const [key,value] of Object.entries(query))for(const v of [value??[]].flat())q.append(key,v)
 const to=moved[view[0]??'']??'/'
 redirect(q.size?`${to}?${q}`:to)
}
