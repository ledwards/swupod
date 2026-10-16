import { redirect } from 'next/navigation'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'
import PackBlitzSetupLegacy from './PackBlitzSetupLegacy'
import { otherFormatsHref, type FormatsSearchParams } from '@/lib/otherFormats'

/** Alpha testers get the redesigned Pack Blitz under /other-formats; everyone else keeps this page. */
export default async function PackBlitzPage({ searchParams }: { searchParams: Promise<FormatsSearchParams> }) {
  if (await viewerHasAlphaAccess()) redirect(otherFormatsHref(`pack-blitz`, await searchParams))
  return <PackBlitzSetupLegacy/>
}
