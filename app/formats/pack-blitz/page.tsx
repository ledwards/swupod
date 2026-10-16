import { redirect } from 'next/navigation'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'
import { alphaPath, withQuery, type SearchParams } from '../../../src/components/PackFormats/packFormats'
import PackBlitzSetupLegacy from './PackBlitzSetupLegacy'

/** Alpha testers get the redesigned Pack Blitz under /other-formats; everyone else keeps this page. */
export default async function PackBlitzPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  if (await viewerHasAlphaAccess()) redirect(withQuery(alphaPath('pack-blitz'), await searchParams))
  return <PackBlitzSetupLegacy/>
}
