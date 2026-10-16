import { redirect } from 'next/navigation'
import { viewerHasAlphaAccess } from '../../../../lib/viewerAccess'
import { alphaPath, withQuery, type SearchParams } from '../../../../src/components/PackFormats/packFormats'
import PackBlitzRoomLegacy from './PackBlitzRoomLegacy'

/** Alpha testers get the redesigned Pack Blitz room under /other-formats; everyone else keeps this page. */
export default async function PackBlitzRoomPage({ params, searchParams }: { params: Promise<{ shareId: string }>; searchParams: Promise<SearchParams> }) {
  if (await viewerHasAlphaAccess()) {
    const { shareId } = await params
    redirect(withQuery(alphaPath('pack-blitz', `/${encodeURIComponent(shareId)}`), await searchParams))
  }
  return <PackBlitzRoomLegacy/>
}
