import ContentSkeleton from '../../../src/components/ContentSkeleton'
import { Suspense } from 'react'
import NativePlay from './NativePlay'
import AlphaPlayGate from './AlphaPlayGate'
import './native-play.css'

export default function NativePlayPage() {
  return <Suspense fallback={<main aria-busy="true"/>}><AlphaPlayGate><Suspense fallback={<main className="native-play-page page-background"><section className="native-play-shell" aria-busy="true"><h1>Play with a friend</h1><ContentSkeleton kind="text"/></section></main>}><NativePlay /></Suspense></AlphaPlayGate></Suspense>
}
