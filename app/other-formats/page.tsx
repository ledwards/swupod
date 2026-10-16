import { redirect } from 'next/navigation'
import OtherFormatsHub from '../../src/components/OtherFormats/OtherFormatsHub'
import { viewerHasAlphaAccess } from '../../lib/viewerAccess'
import { legacyFormatsHref } from '../../lib/otherFormats'

type Query = Promise<Record<string, string | string[] | undefined>>

/** The alternate-format hub (alpha). Everyone else keeps /formats. */
export default async function OtherFormatsPage({ searchParams }: { searchParams: Query }) {
  if (!(await viewerHasAlphaAccess())) redirect(legacyFormatsHref('', await searchParams))
  return <OtherFormatsHub/>
}
