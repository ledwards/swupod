'use client'
import {useBetaExperience} from '@/src/services/entry/useBetaExperience'
import EntryPlay from '@/src/components/EntryFlow/EntryPlay'
import PlayLobby from './PlayLobby'
export default function PlayEntry(){
 const {enabled,loading}=useBetaExperience()
 if(loading)return <main aria-busy="true"/>
 return enabled?<EntryPlay/>:<PlayLobby/>
}
