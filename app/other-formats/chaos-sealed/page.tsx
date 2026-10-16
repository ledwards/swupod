import { redirect } from 'next/navigation'
import ChaosSealedSetup from './ChaosSealedSetup'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'
import { legacyFormatsHref, type FormatsSearchParams } from '@/lib/otherFormats'

/** Alpha: the Chaos Sealed setup. Everyone else goes back to /formats/chaos-sealed (query kept). */
export default async function OtherFormatsChaosSealedPage({ searchParams }: { searchParams: Promise<FormatsSearchParams> }) {
  if (!(await viewerHasAlphaAccess())) redirect(legacyFormatsHref('chaos-sealed', await searchParams))
  return <ChaosSealedSetup/>
}
