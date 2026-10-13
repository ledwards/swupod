import ContentSkeleton from '../../../src/components/ContentSkeleton'
import { Suspense } from 'react'
import NativePlay from './NativePlay'
import AlphaPlayGate from './AlphaPlayGate'
import { redirect } from 'next/navigation'
import { viewerHasAlphaAccess } from '@/lib/viewerAccess'
import './native-play.css'

export default async function NativePlayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Alpha testers use the one Play setup; invitation and match links still open their table.
  if (!Object.keys(await searchParams).length && await viewerHasAlphaAccess()) redirect('/play')
  return <Suspense fallback={<main className="native-play-page page-background"><section className="native-play-shell" aria-busy="true"><h1>Play with a friend</h1><ContentSkeleton kind="text"/></section></main>}><AlphaPlayGate><NativePlay /></AlphaPlayGate></Suspense>

}
