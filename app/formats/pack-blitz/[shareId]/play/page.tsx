import { redirect } from 'next/navigation'
import { viewerHasAlphaAccess } from '../../../../../lib/viewerAccess'
import { alphaPath, withQuery, type SearchParams } from '../../../../../src/components/PackFormats/packFormats'
import PackBlitzPlayLegacy from './PackBlitzPlayLegacy'

/** Alpha testers get the redesigned Pack Blitz play step under /other-formats; everyone else keeps this page. */
export default async function PackBlitzPlayPage({ params, searchParams }: { params: Promise<{ shareId: string }>; searchParams: Promise<SearchParams> }) {
  if (await viewerHasAlphaAccess()) {
    const { shareId } = await params
    redirect(withQuery(alphaPath('pack-blitz', `/${encodeURIComponent(shareId)}/play`), await searchParams))
  }
  return <PackBlitzPlayLegacy/>
}
