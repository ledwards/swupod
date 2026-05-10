/**
 * OG image for /pool/[shareId]/deck/[buildId] — the build is itself a
 * card_pools row whose share_id == buildId, so we just generate the
 * deck image for the buildId.
 */

import { respondWithDeckImage } from '@/lib/og/poolDeckImage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const contentType = 'image/png'
export const size = { width: 1200, height: 630 }

export default async function Image({
  params,
}: {
  params: Promise<{ shareId: string; buildId: string }>
}) {
  const { buildId } = await params
  return respondWithDeckImage(buildId)
}
