'use client'
import {useEffect} from 'react'
import {useRouter} from 'next/navigation'
import {useAlphaUi} from '@/src/contexts/AlphaUiContext'
import {useAuth} from '@/src/contexts/AuthContext'
import {hasAlphaAccess} from '@/src/services/entry/access'
import EntryPlay from '@/src/components/EntryFlow/EntryPlay'
import PlayLobby from './PlayLobby'
// Alpha (rollout on) gets the new play entry. The limited-queue lobby's APIs
// are alpha-only (requireAlphaAccess), so it stays for alpha users with the
// rollout off; everyone else goes home.
export default function PlayEntry(){
 const {enabled,loading}=useAlphaUi()
 const {user}=useAuth() as {user:{is_admin?:boolean;is_alpha_tester?:boolean}|null}
 const router=useRouter()
 const queue=!enabled&&hasAlphaAccess(user)
 useEffect(()=>{if(!loading&&!enabled&&!queue)router.replace('/')},[loading,enabled,queue,router])
 if(loading||(!enabled&&!queue))return <main aria-busy="true"/>
 return enabled?<EntryPlay/>:<PlayLobby/>
}
