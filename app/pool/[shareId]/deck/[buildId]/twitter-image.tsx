/**
 * Twitter card image for /pool/[shareId]/deck/[buildId].
 * Mirrors opengraph-image.tsx for the same route.
 *
 * v2: letterbox + deck-only.
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
