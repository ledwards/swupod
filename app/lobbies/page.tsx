import {Suspense} from 'react'
import NativePlay from '@/app/play/native/NativePlay'
import AlphaPlayGate from '@/app/play/native/AlphaPlayGate'
import '@/app/play/native/native-play.css'
export default function Page(){return <Suspense><AlphaPlayGate><NativePlay publicLobby/></AlphaPlayGate></Suspense>}
