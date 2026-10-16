import { redirect } from 'next/navigation'
import ChaosSealedLegacy from './ChaosSealedLegacy'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'
import { otherFormatsHref, type FormatsSearchParams } from '@/lib/otherFormats'

/** Alpha testers use /other-formats/chaos-sealed (query kept); everyone else keeps this page. */
export default async function ChaosSealedPage({ searchParams }: { searchParams: Promise<FormatsSearchParams> }) {
  if (await viewerHasAlphaAccess()) redirect(otherFormatsHref('chaos-sealed', await searchParams))
  return <ChaosSealedLegacy/>
}
