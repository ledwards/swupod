import {Suspense} from 'react'
import NativePlay from '@/app/play/native/NativePlay'
import '@/app/play/native/native-play.css'
export default function Page(){return <Suspense><NativePlay publicLobby/></Suspense>}
