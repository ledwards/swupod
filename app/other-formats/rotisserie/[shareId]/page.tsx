import { redirect } from 'next/navigation'
import RotisserieRoom from './RotisserieRoom'
import { viewerHasAlphaAccess } from '../../../../lib/viewerAccess'
import { legacyFormatsHref } from '../../../../lib/otherFormats'

type Query = Promise<Record<string, string | string[] | undefined>>

/** The Rotisserie lobby, draft and results (alpha, themed). Everyone else keeps /formats/rotisserie/<id>. */
export default async function RotisserieRoomPage({ params, searchParams }: { params: Promise<{ shareId: string }>; searchParams: Query }) {
  if (!(await viewerHasAlphaAccess())) redirect(legacyFormatsHref(`rotisserie/${encodeURIComponent((await params).shareId)}`, await searchParams))
  return <RotisserieRoom/>
}
