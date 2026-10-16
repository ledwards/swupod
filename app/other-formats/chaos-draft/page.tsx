import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import ChaosDraftSetup from './ChaosDraftSetup'
import { EntrySkeleton } from '../../../src/components/EntryFlow/EntrySkeleton'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'
import { legacyFormatsPath, type SearchParams } from './formatPaths'

/** Alpha: the one Chaos Draft setup. Everyone else goes back to /formats/chaos-draft (query kept). */
export default async function OtherFormatsChaosDraftPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  if (!(await viewerHasAlphaAccess())) redirect(legacyFormatsPath('chaos-draft', await searchParams))
  return <Suspense fallback={<EntrySkeleton page="draft"/>}><ChaosDraftSetup/></Suspense>
}
