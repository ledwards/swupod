import { redirect } from 'next/navigation'
import { viewerHasAlphaAccess } from '../../../../../lib/viewerAccess'
import PackWarsPlayLegacy from './PackWarsPlayLegacy'
import { otherFormatsHref, type FormatsSearchParams } from '@/lib/otherFormats'

/** Alpha testers get the redesigned Pack Wars play step under /other-formats; everyone else keeps this page. */
export default async function PackWarsPlayPage({ params, searchParams }: { params: Promise<{ shareId: string }>; searchParams: Promise<FormatsSearchParams> }) {
  if (await viewerHasAlphaAccess()) {
    const { shareId } = await params
    redirect(otherFormatsHref(`pack-wars/${encodeURIComponent(shareId)}/play`, await searchParams))
  }
  return <PackWarsPlayLegacy/>
}
