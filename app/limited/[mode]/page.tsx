import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import EntryGate from '@/src/components/EntryFlow/EntryGate'
import EntrySetup from '@/src/components/EntryFlow/EntrySetup'
import EntryPlay from '@/src/components/EntryFlow/EntryPlay'
import EntryAi from '@/src/components/EntryFlow/EntryAi'
import { EntrySkeleton, type EntryLoadingPage } from '@/src/components/EntryFlow/EntrySkeleton'
export default async function Page({ params }: { params: Promise<{ mode: string }> }) {
  const { mode } = await params
  if (!['draft', 'sealed', 'play', 'ai'].includes(mode)) notFound()
  return (
    <Suspense fallback={<EntrySkeleton page={mode as EntryLoadingPage} />}>
      <EntryGate page={mode as EntryLoadingPage} fallback={mode === 'draft' ? '/draft' : mode === 'sealed' ? '/sealed' : '/'}>
        {mode === 'play' ? (
          <EntryPlay />
        ) : mode === 'ai' ? (
          <EntryAi />
        ) : (
          <EntrySetup format={mode as 'draft' | 'sealed'} />
        )}
      </EntryGate>
    </Suspense>
  )
}
