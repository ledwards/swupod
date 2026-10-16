import { redirect } from 'next/navigation'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'
import PackFormatSetup from '../../../src/components/PackFormats/PackFormatSetup'
import { legacyFormatsHref, type FormatsSearchParams } from '@/lib/otherFormats'

/** Pack Blitz setup (alpha). Everyone else is sent back to /formats/pack-blitz. */
export default async function PackBlitzAlphaPage({ searchParams }: { searchParams: Promise<FormatsSearchParams> }) {
  if (!(await viewerHasAlphaAccess())) redirect(legacyFormatsHref(`pack-blitz`, await searchParams))
  return <PackFormatSetup format="pack-blitz"/>
}
