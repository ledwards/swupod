import { redirect } from 'next/navigation'
import { viewerHasAlphaAccess } from '../../../../../lib/viewerAccess'
import { legacyPath, withQuery, type SearchParams } from '../../../../../src/components/PackFormats/packFormats'
import PackFormatPlay from '../../../../../src/components/PackFormats/PackFormatPlay'

/** Pack Blitz play step (alpha): pick a leader and base, then choose where to play. */
export default async function PackBlitzAlphaPlayPage({ params, searchParams }: { params: Promise<{ shareId: string }>; searchParams: Promise<SearchParams> }) {
  const { shareId } = await params
  if (!(await viewerHasAlphaAccess())) redirect(withQuery(legacyPath('pack-blitz', `/${encodeURIComponent(shareId)}/play`), await searchParams))
  // On-platform play vs the AI (Workstream C1) is Pack Wars only, behind its own flag.
  const nativeAiAvailable = false
  return <PackFormatPlay format="pack-blitz" shareId={shareId} nativeAiAvailable={nativeAiAvailable}/>
}
