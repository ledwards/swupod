import {Suspense} from 'react'
import {redirect} from 'next/navigation'
import NativePlay from '@/app/play/native/NativePlay'
import {viewerHasAlphaAccess} from '@/lib/viewerAccess'
import '@/app/play/native/native-play.css'
/** Alpha testers find public games in the one Play setup. */
export default async function Page(){
 if(await viewerHasAlphaAccess())redirect('/play')
 return <Suspense><NativePlay publicLobby/></Suspense>
}
