'use client'
import {useBetaExperience} from '@/src/services/entry/useBetaExperience'
import NativePlay from './native/NativePlay'
import PlayLobby from './PlayLobby'
export default function PlayEntry(){
 const {enabled,loading}=useBetaExperience()
 if(loading)return <div className="ptp-play-page" aria-busy="true"><div className="ptp-play-shell"/></div>
 return enabled?<NativePlay publicLobby/>:<PlayLobby/>
}
