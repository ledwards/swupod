import {Suspense} from 'react'
import {redirect} from 'next/navigation'
import SoloPlay from './SoloPlay'
import './solo-play.css'
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams
 // Recover links produced by the old sign-in redirect's second question mark.
 const malformed=typeof params.pool==='string'&&params.pool.match(/^([A-Za-z0-9_-]{8})\?auth=(already_logged_in|success)$/)
 if(malformed){
  const repaired=new URLSearchParams()
  for(const [key,value] of Object.entries(params)){
   if(Array.isArray(value))value.forEach(item=>repaired.append(key,item))
   else if(value!==undefined)repaired.set(key,value)
  }
  repaired.set('pool',malformed[1]!);repaired.set('auth',malformed[2]!)
  redirect(`/play/solo?${repaired}`)
 }
 return <Suspense><SoloPlay aiEnabled={process.env.PTP_NATIVE_PLAY_ENABLED === 'true' && process.env.PTP_SOLO_AI_ENABLED === 'true'}/></Suspense>
}
