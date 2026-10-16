import { redirect } from 'next/navigation'
import { viewerHasAlphaAccess } from '../../../../lib/viewerAccess'
import { legacyPath, withQuery, type SearchParams } from '../../../../src/components/PackFormats/packFormats'
import PackFormatRoom from '../../../../src/components/PackFormats/PackFormatRoom'

/** Pack Wars room (alpha): your opened packs, then Play. Everyone else is sent back to /formats. */
export default async function PackWarsAlphaRoomPage({ params, searchParams }: { params: Promise<{ shareId: string }>; searchParams: Promise<SearchParams> }) {
  const { shareId } = await params
  if (!(await viewerHasAlphaAccess())) redirect(withQuery(legacyPath('pack-wars', `/${encodeURIComponent(shareId)}`), await searchParams))
  return <PackFormatRoom format="pack-wars" shareId={shareId}/>
}
