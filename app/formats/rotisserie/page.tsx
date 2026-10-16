import { redirect } from 'next/navigation'
import RotisserieCreateLegacy from './RotisserieCreateLegacy'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'
import { otherFormatsHref } from '../../../lib/otherFormats'

type Query = Promise<Record<string, string | string[] | undefined>>

/** Alpha viewers get the Rotisserie setup at /other-formats/rotisserie; everyone else keeps this page. */
export default async function RotisseriePage({ searchParams }: { searchParams: Query }) {
  if (await viewerHasAlphaAccess()) redirect(otherFormatsHref('rotisserie', await searchParams))
  return <RotisserieCreateLegacy/>
}
