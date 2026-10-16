import { redirect } from 'next/navigation'
import ChaosSealedSetup from './ChaosSealedSetup'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'
import { legacyFormatsPath, type SearchParams } from '../chaos-draft/formatPaths'

/** Alpha: the Chaos Sealed setup. Everyone else goes back to /formats/chaos-sealed (query kept). */
export default async function OtherFormatsChaosSealedPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  if (!(await viewerHasAlphaAccess())) redirect(legacyFormatsPath('chaos-sealed', await searchParams))
  return <ChaosSealedSetup/>
}
