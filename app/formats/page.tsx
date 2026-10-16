import { redirect } from 'next/navigation'
import FormatsHubLegacy from './FormatsHubLegacy'
import { viewerHasAlphaAccess } from '../../lib/viewerAccess'
import { otherFormatsHref } from '../../lib/otherFormats'

type Query = Promise<Record<string, string | string[] | undefined>>

/** Alpha viewers have the hub at /other-formats; everyone else keeps this page. */
export default async function FormatsPage({ searchParams }: { searchParams: Query }) {
  if (await viewerHasAlphaAccess()) redirect(otherFormatsHref('', await searchParams))
  return <FormatsHubLegacy/>
}
