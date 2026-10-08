'use client'
import {useEffect} from 'react'
import {useRouter,useSearchParams} from 'next/navigation'
import {useBetaExperience} from '@/src/services/entry/useBetaExperience'
import SoloPlay from './SoloPlay'
export default function SoloEntry(){
 const {enabled,loading}=useBetaExperience(),router=useRouter(),params=useSearchParams()
 useEffect(()=>{if(enabled)router.replace(params.has('pool')?`/limited/swiss?${params}`:'/play')},[enabled,router,params])
 return enabled||loading?<main aria-busy="true"/>:<SoloPlay aiEnabled={false}/>
}
