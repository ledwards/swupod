import { Suspense } from 'react'
import PlayLobby from './PlayLobby'
import './play.css'

export default function PlayPage() {
  // useSearchParams (in PlayLobby) requires a Suspense boundary for the
  // build-time prerender — same pattern as app/lobby/page.tsx. The fallback
  // mirrors the page shell so the swap is not a visible jump.
  return (
    <Suspense fallback={<div className="ptp-play-page"><div className="ptp-play-shell" /></div>}>
      <PlayLobby />
    </Suspense>
  )
}
