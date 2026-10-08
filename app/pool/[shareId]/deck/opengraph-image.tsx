/**
 * OG image for /pool/[shareId]/deck — renders the deck image (leader,
 * base, deck) via the swuapi.com /deck-image endpoint, letterboxed
 * into a 1200×630 canvas in the helper.
 *
 * v2: letterbox + deck-only.
 */

import { respondWithDeckImage } from '@/lib/og/poolDeckImage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const contentType = 'image/png'
// swuapi's deck-image returns a tall portrait composition. Declaring a
// representative size keeps the og:image:width / og:image:height meta
// tags honest for crawlers; actual served image dimensions are whatever
// swuapi produces.
export const size = { width: 1200, height: 630 }

export default async function Image({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params
  return respondWithDeckImage(shareId)
}
