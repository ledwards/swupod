import { hyperspaceLeaderArtForCard } from '../../utils/hyperspaceLeaderArt'
import { getPackArtUrl } from '../../utils/packArt'

type CatalogCard = { id: string; type: string; imageUrl: string; backImageUrl?: string; name?: string; subtitle?: string; set?: string }
/** Saved builds provide an identity; artwork always comes from the canonical catalog. */
export function resumeArt(setCode: string, saved: unknown, cards: readonly CatalogCard[]) {
  try {
    const state = typeof saved === 'string' ? JSON.parse(saved) : saved
    const leaderId = state?.cardPositions?.[state?.activeLeader]?.card?.id
    const leader = cards.find((card) => card.id === leaderId && card.type === 'Leader')
    if (leader) {
      const imageUrl = hyperspaceLeaderArtForCard(leader) || leader.backImageUrl
      if (imageUrl) return { imageUrl, artKind: 'leader' as const }
    }
  } catch {
    /* Unbuilt or older saved state uses the set art. */
  }
  return { imageUrl: getPackArtUrl(setCode.replace('-CB', '')), artKind: 'set' as const }
}
