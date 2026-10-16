import { redirect } from 'next/navigation'
import { viewerHasAlphaAccess } from '../../../../lib/viewerAccess'
import PackFormatRoom from '../../../../src/components/PackFormats/PackFormatRoom'
import { legacyFormatsHref, type FormatsSearchParams } from '@/lib/otherFormats'

/** Pack Blitz room (alpha): your opened packs, then Play. Everyone else is sent back to /formats. */
export default async function PackBlitzAlphaRoomPage({ params, searchParams }: { params: Promise<{ shareId: string }>; searchParams: Promise<FormatsSearchParams> }) {
  const { shareId } = await params
  if (!(await viewerHasAlphaAccess())) redirect(legacyFormatsHref(`pack-blitz/${encodeURIComponent(shareId)}`, await searchParams))
  return <PackFormatRoom format="pack-blitz" shareId={shareId}/>
}
