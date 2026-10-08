
import ContentSkeleton from '../../../src/components/ContentSkeleton'
import EntryGate from '@/src/components/EntryFlow/EntryGate'
import { Suspense } from 'react'
import NativePlay from './NativePlay'
import './native-play.css'

export default function NativePlayPage() {
  return <Suspense fallback={<main className="native-play-page page-background"><section className="native-play-shell" aria-busy="true"><h1>Play with a friend</h1><ContentSkeleton kind="text"/></section></main>}><EntryGate fallback="/play" page="play" allowSignedOut><NativePlay /></EntryGate></Suspense>

}
