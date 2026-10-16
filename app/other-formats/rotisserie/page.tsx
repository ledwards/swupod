import { redirect } from 'next/navigation'
import RotisserieSetup from '../../../src/components/OtherFormats/RotisserieSetup'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'
import { legacyFormatsHref } from '../../../lib/otherFormats'

type Query = Promise<Record<string, string | string[] | undefined>>

/** Rotisserie setup (alpha): choose everything, then create. Everyone else keeps /formats/rotisserie. */
export default async function RotisserieSetupPage({ searchParams }: { searchParams: Query }) {
  if (!(await viewerHasAlphaAccess())) redirect(legacyFormatsHref('rotisserie', await searchParams))
  return <RotisserieSetup/>
}
