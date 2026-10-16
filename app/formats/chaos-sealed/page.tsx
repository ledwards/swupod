import { redirect } from 'next/navigation'
import ChaosSealedLegacy from './ChaosSealedLegacy'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'
import { otherFormatsPath, type SearchParams } from '../../other-formats/chaos-draft/formatPaths'

/** Alpha testers use /other-formats/chaos-sealed (query kept); everyone else keeps this page. */
export default async function ChaosSealedPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  if (await viewerHasAlphaAccess()) redirect(otherFormatsPath('chaos-sealed', await searchParams))
  return <ChaosSealedLegacy/>
}
