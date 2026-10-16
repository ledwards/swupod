import { redirect } from 'next/navigation'
import { viewerHasAlphaAccess } from '../../../lib/viewerAccess'
import { otherFormatsHref } from '../../../lib/otherFormats'

type Query = Promise<Record<string, string | string[] | undefined>>

/**
 * Rotisserie is alpha-only for now (Lee, 2026-10-15): alpha viewers get the setup at
 * /other-formats/rotisserie; everyone else is sent back to the hub, where it's Coming Soon.
 * Existing room links (/formats/rotisserie/[shareId]) keep working for everyone.
 */
export default async function RotisseriePage({ searchParams }: { searchParams: Query }) {
  if (await viewerHasAlphaAccess()) redirect(otherFormatsHref('rotisserie', await searchParams))
  redirect('/formats')
}
