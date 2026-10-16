import { redirect } from 'next/navigation'
import LiveChaosDraftLegacy from './LiveChaosDraftLegacy'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'
import { liveChaosDraftHref, type FormatsSearchParams } from '@/lib/otherFormats'

/**
 * Alpha testers have one Chaos Draft setup (/other-formats/chaos-draft); this old live page
 * sends them there on "With Other Players", query kept. Everyone else keeps this page.
 */
export default async function LiveChaosDraftPage({ searchParams }: { searchParams: Promise<FormatsSearchParams> }) {
  if (await viewerHasAlphaAccess()) redirect(liveChaosDraftHref(await searchParams))
  return <LiveChaosDraftLegacy/>
}
