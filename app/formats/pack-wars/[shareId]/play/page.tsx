import { redirect } from 'next/navigation'
import { viewerHasAlphaAccess } from '../../../../../lib/viewerAccess'
import { alphaPath, withQuery, type SearchParams } from '../../../../../src/components/PackFormats/packFormats'
import PackWarsPlayLegacy from './PackWarsPlayLegacy'

/** Alpha testers get the redesigned Pack Wars play step under /other-formats; everyone else keeps this page. */
export default async function PackWarsPlayPage({ params, searchParams }: { params: Promise<{ shareId: string }>; searchParams: Promise<SearchParams> }) {
  if (await viewerHasAlphaAccess()) {
    const { shareId } = await params
    redirect(withQuery(alphaPath('pack-wars', `/${encodeURIComponent(shareId)}/play`), await searchParams))
  }
  return <PackWarsPlayLegacy/>
}
