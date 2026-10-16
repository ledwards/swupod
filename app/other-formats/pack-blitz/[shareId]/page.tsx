import { redirect } from 'next/navigation'
import { viewerHasAlphaAccess } from '../../../../lib/viewerAccess'
import { legacyPath, withQuery, type SearchParams } from '../../../../src/components/PackFormats/packFormats'
import PackFormatRoom from '../../../../src/components/PackFormats/PackFormatRoom'

/** Pack Blitz room (alpha): your opened packs, then Play. Everyone else is sent back to /formats. */
export default async function PackBlitzAlphaRoomPage({ params, searchParams }: { params: Promise<{ shareId: string }>; searchParams: Promise<SearchParams> }) {
  const { shareId } = await params
  if (!(await viewerHasAlphaAccess())) redirect(withQuery(legacyPath('pack-blitz', `/${encodeURIComponent(shareId)}`), await searchParams))
  return <PackFormatRoom format="pack-blitz" shareId={shareId}/>
}
