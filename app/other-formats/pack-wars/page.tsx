import { redirect } from 'next/navigation'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'
import { legacyPath, withQuery, type SearchParams } from '../../../src/components/PackFormats/packFormats'
import PackFormatSetup from '../../../src/components/PackFormats/PackFormatSetup'

/** Pack Wars setup (alpha). Everyone else is sent back to /formats/pack-wars. */
export default async function PackWarsAlphaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  if (!(await viewerHasAlphaAccess())) redirect(withQuery(legacyPath('pack-wars'), await searchParams))
  return <PackFormatSetup format="pack-wars" nativeAiAvailable={process.env['PTP_PACK_WARS_NATIVE_ENABLED'] === 'true'}/>
}
