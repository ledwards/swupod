/**
 * Twitter card image for /pool/[shareId]/deck — same renderer as
 * opengraph-image.tsx. Twitter clients prefer twitter:image over
 * og:image, so we have to set both.
 */

import { respondWithDeckImage } from '@/lib/og/poolDeckImage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const contentType = 'image/png'
export const size = { width: 1200, height: 630 }

export default async function Image({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params
  return respondWithDeckImage(shareId)
}
