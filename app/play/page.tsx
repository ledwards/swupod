import {Suspense} from 'react'
import {redirect} from 'next/navigation'
import PlayEntry from './PlayEntry'
import {viewerHasAlphaAccess} from '../../lib/viewerAccess'
import {playSetupPath} from '../../lib/playSetup'
import './play.css'
import './native/native-play.css'
/** Alpha testers play from the homepage's Play setup; everyone else keeps the current play page. */
export default async function PlayPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 if(await viewerHasAlphaAccess())redirect(playSetupPath(await searchParams))
 return <Suspense fallback={<div className="ptp-play-page" aria-busy="true"><div className="ptp-play-shell"/></div>}><PlayEntry/></Suspense>
}
