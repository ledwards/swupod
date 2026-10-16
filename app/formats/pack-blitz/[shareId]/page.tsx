import { redirect } from 'next/navigation'
import { viewerHasAlphaAccess } from '../../../../lib/viewerAccess'
import PackBlitzRoomLegacy from './PackBlitzRoomLegacy'
import { otherFormatsHref, type FormatsSearchParams } from '@/lib/otherFormats'

/** Alpha testers get the redesigned Pack Blitz room under /other-formats; everyone else keeps this page. */
export default async function PackBlitzRoomPage({ params, searchParams }: { params: Promise<{ shareId: string }>; searchParams: Promise<FormatsSearchParams> }) {
  if (await viewerHasAlphaAccess()) {
    const { shareId } = await params
    redirect(otherFormatsHref(`pack-blitz/${encodeURIComponent(shareId)}`, await searchParams))
  }
  return <PackBlitzRoomLegacy/>
}
