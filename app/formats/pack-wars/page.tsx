import { redirect } from 'next/navigation'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'
import { alphaPath, withQuery, type SearchParams } from '../../../src/components/PackFormats/packFormats'
import PackWarsSetupLegacy from './PackWarsSetupLegacy'

/** Alpha testers get the redesigned Pack Wars under /other-formats; everyone else keeps this page. */
export default async function PackWarsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  if (await viewerHasAlphaAccess()) redirect(withQuery(alphaPath('pack-wars'), await searchParams))
  return <PackWarsSetupLegacy/>
}
