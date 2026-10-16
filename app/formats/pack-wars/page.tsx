import { redirect } from 'next/navigation'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'
import PackWarsSetupLegacy from './PackWarsSetupLegacy'
import { otherFormatsHref, type FormatsSearchParams } from '@/lib/otherFormats'

/** Alpha testers get the redesigned Pack Wars under /other-formats; everyone else keeps this page. */
export default async function PackWarsPage({ searchParams }: { searchParams: Promise<FormatsSearchParams> }) {
  if (await viewerHasAlphaAccess()) redirect(otherFormatsHref(`pack-wars`, await searchParams))
  return <PackWarsSetupLegacy/>
}
