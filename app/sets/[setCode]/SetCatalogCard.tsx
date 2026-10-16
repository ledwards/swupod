'use client'

import Card from '@/src/components/Card'
import CardWithPreview from '@/src/components/CardWithPreview'
import type { CatalogCard } from '@/src/services/cards/setCatalog'

/**
 * One card on the set page. Spoiled cards get the standard preview (hover on
 * desktop, long-press on touch); unknown slots have no image, so no preview.
 */
export default function SetCatalogCard({ card }: { card: CatalogCard }) {
  return card.imageUrl ? <CardWithPreview card={card} /> : <Card card={card} aspectsAsIcons />
}
