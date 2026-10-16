import { redirect } from 'next/navigation'
import { viewerHasAlphaAccess } from '../../../../lib/viewerAccess'
import { alphaPath, withQuery, type SearchParams } from '../../../../src/components/PackFormats/packFormats'
import PackWarsRoomLegacy from './PackWarsRoomLegacy'

/** Alpha testers get the redesigned Pack Wars room under /other-formats; everyone else keeps this page. */
export default async function PackWarsRoomPage({ params, searchParams }: { params: Promise<{ shareId: string }>; searchParams: Promise<SearchParams> }) {
  if (await viewerHasAlphaAccess()) {
    const { shareId } = await params
    redirect(withQuery(alphaPath('pack-wars', `/${encodeURIComponent(shareId)}`), await searchParams))
  }
  return <PackWarsRoomLegacy/>
}
