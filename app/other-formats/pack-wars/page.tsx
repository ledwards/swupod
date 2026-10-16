import { redirect } from 'next/navigation'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'
import PackFormatSetup from '../../../src/components/PackFormats/PackFormatSetup'
import { legacyFormatsHref, type FormatsSearchParams } from '@/lib/otherFormats'

/** Pack Wars setup (alpha). Everyone else is sent back to /formats/pack-wars. */
export default async function PackWarsAlphaPage({ searchParams }: { searchParams: Promise<FormatsSearchParams> }) {
  if (!(await viewerHasAlphaAccess())) redirect(legacyFormatsHref(`pack-wars`, await searchParams))
  return <PackFormatSetup format="pack-wars" nativeAiAvailable={process.env['PTP_PACK_WARS_NATIVE_ENABLED'] === 'true'}/>
}
