import { redirect } from 'next/navigation'
import ChaosDraftLegacy from './ChaosDraftLegacy'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'
import { otherFormatsPath, type SearchParams } from '../../other-formats/chaos-draft/formatPaths'

/** Alpha testers use /other-formats/chaos-draft (query kept); everyone else keeps this page. */
export default async function ChaosDraftPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  if (await viewerHasAlphaAccess()) redirect(otherFormatsPath('chaos-draft', await searchParams))
  return <ChaosDraftLegacy/>
}
