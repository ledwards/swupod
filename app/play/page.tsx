import {Suspense} from 'react'
import PlayEntry from './PlayEntry'
import './play.css'
import './native/native-play.css'
export default function PlayPage(){
 return <Suspense fallback={<div className="ptp-play-page" aria-busy="true"><div className="ptp-play-shell"/></div>}><PlayEntry/></Suspense>
}
