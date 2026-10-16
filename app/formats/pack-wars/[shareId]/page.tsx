import { redirect } from 'next/navigation'
import { viewerHasAlphaAccess } from '../../../../lib/viewerAccess'
import PackWarsRoomLegacy from './PackWarsRoomLegacy'
import { otherFormatsHref, type FormatsSearchParams } from '@/lib/otherFormats'

/** Alpha testers get the redesigned Pack Wars room under /other-formats; everyone else keeps this page. */
export default async function PackWarsRoomPage({ params, searchParams }: { params: Promise<{ shareId: string }>; searchParams: Promise<FormatsSearchParams> }) {
  if (await viewerHasAlphaAccess()) {
    const { shareId } = await params
    redirect(otherFormatsHref(`pack-wars/${encodeURIComponent(shareId)}`, await searchParams))
  }
  return <PackWarsRoomLegacy/>
}
