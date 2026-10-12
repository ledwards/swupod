import {Suspense} from 'react'
import {redirect} from 'next/navigation'
import PlayEntry from './PlayEntry'
import PlayHomepage from '../../src/components/PlayHomepage'
import {viewerHasAlphaAccess} from '../../lib/viewerAccess'
import './play.css'
import './native/native-play.css'
/** Alpha testers get the homepage bundle's Play page here; everyone else keeps the current play page while native play is on. */
export default async function PlayPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 // An invitation link always opens the private-game lobby; signed out it only offers login, and joining still needs a beta account.
 const {format,invite}=await searchParams
 if(invite||await viewerHasAlphaAccess())return <PlayHomepage path={format==='eternal'?'/play?format=eternal':'/play'}/>
 if(process.env.PTP_NATIVE_PLAY_ENABLED!=='true')redirect('/')
 return <Suspense fallback={<div className="ptp-play-page" aria-busy="true"><div className="ptp-play-shell"/></div>}><PlayEntry/></Suspense>
}
