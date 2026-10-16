import { redirect } from 'next/navigation'
import ChaosDraftLegacy from './ChaosDraftLegacy'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'
import { otherFormatsHref, type FormatsSearchParams } from '@/lib/otherFormats'

/** Alpha testers use /other-formats/chaos-draft (query kept); everyone else keeps this page. */
export default async function ChaosDraftPage({ searchParams }: { searchParams: Promise<FormatsSearchParams> }) {
  if (await viewerHasAlphaAccess()) redirect(otherFormatsHref('chaos-draft', await searchParams))
  return <ChaosDraftLegacy/>
}
