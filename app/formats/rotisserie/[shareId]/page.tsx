import { redirect } from 'next/navigation'
import RotisseriePlayLegacy from './RotisseriePlayLegacy'
import { viewerHasAlphaAccess } from '../../../../lib/viewerAccess'
import { otherFormatsHref } from '../../../../lib/otherFormats'

type Query = Promise<Record<string, string | string[] | undefined>>

/** Alpha viewers get the themed room at /other-formats/rotisserie/<id>; everyone else keeps this page. */
export default async function RotisseriePlayPage({ params, searchParams }: { params: Promise<{ shareId: string }>; searchParams: Query }) {
  if (await viewerHasAlphaAccess()) redirect(otherFormatsHref(`rotisserie/${encodeURIComponent((await params).shareId)}`, await searchParams))
  return <RotisseriePlayLegacy/>
}
