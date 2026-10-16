import { redirect } from 'next/navigation'
import LiveChaosDraftLegacy from './LiveChaosDraftLegacy'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'
import { liveChaosDraftPath, type SearchParams } from '../../other-formats/chaos-draft/formatPaths'

/**
 * Alpha testers have one Chaos Draft setup (/other-formats/chaos-draft); this old live page
 * sends them there on "With Other Players", query kept. Everyone else keeps this page.
 */
export default async function LiveChaosDraftPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  if (await viewerHasAlphaAccess()) redirect(liveChaosDraftPath(await searchParams))
  return <LiveChaosDraftLegacy/>
}
