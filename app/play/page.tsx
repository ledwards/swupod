import { Suspense } from 'react'
import NativePlay from './native/NativePlay'
import './native/native-play.css'

export default function PlayPage() {
  return <Suspense fallback={<main className="native-play-page page-background"><section className="native-play-shell" aria-busy="true"><h1>Play</h1><p>Loading your table…</p></section></main>}><NativePlay publicLobby /></Suspense>
}
