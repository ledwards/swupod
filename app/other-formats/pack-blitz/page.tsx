import { redirect } from 'next/navigation'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'
import { legacyPath, withQuery, type SearchParams } from '../../../src/components/PackFormats/packFormats'
import PackFormatSetup from '../../../src/components/PackFormats/PackFormatSetup'

/** Pack Blitz setup (alpha). Everyone else is sent back to /formats/pack-blitz. */
export default async function PackBlitzAlphaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  if (!(await viewerHasAlphaAccess())) redirect(withQuery(legacyPath('pack-blitz'), await searchParams))
  return <PackFormatSetup format="pack-blitz"/>
}
