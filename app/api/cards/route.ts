// GET /api/cards?set=SOR  — card data for client consumers (U5, foundations
// hardening). Clients must fetch card data from here instead of statically
// importing the ~8 MB cards.json into their bundle. The response is served
// from the server-side cardData module, so the fix-at-runtime system
// (applyCardFixes) stays the single source of corrected data.
//
//   ?set=<CODE>  → cards for one set (e.g. SOR, LAW)
//   ?set=all     → the full corrected card list
import { getCardsBySet, getAllCards } from '@/src/utils/cardData'
import { NextRequest, NextResponse } from 'next/server'

// Card data only changes on deploy (cards.json ships with the build), so the
// response is aggressively cacheable.
const CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const set = searchParams.get('set')

  if (!set) {
    return NextResponse.json(
      { success: false, data: null, message: 'set parameter is required (a set code, or "all")' },
      { status: 400 }
    )
  }

  const cards = set === 'all' ? getAllCards() : getCardsBySet(set)

  return NextResponse.json(
    { success: true, data: { set, count: cards.length, cards } },
    { headers: { 'Cache-Control': CACHE_CONTROL } }
  )
}
