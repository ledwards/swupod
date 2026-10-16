import { redirect } from 'next/navigation'
import { viewerHasAlphaAccess } from '../../../../../lib/viewerAccess'
import PackBlitzPlayLegacy from './PackBlitzPlayLegacy'
import { otherFormatsHref, type FormatsSearchParams } from '@/lib/otherFormats'

/** Alpha testers get the redesigned Pack Blitz play step under /other-formats; everyone else keeps this page. */
export default async function PackBlitzPlayPage({ params, searchParams }: { params: Promise<{ shareId: string }>; searchParams: Promise<FormatsSearchParams> }) {
  if (await viewerHasAlphaAccess()) {
    const { shareId } = await params
    redirect(otherFormatsHref(`pack-blitz/${encodeURIComponent(shareId)}/play`, await searchParams))
  }
  return <PackBlitzPlayLegacy/>
}
