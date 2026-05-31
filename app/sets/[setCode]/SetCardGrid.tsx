// @ts-nocheck
'use client'

import { useMemo } from 'react'
import Card from '@/src/components/Card'
import CardWithPreview from '@/src/components/CardWithPreview'
import { getAspectSortKey, getTypeOrder } from '@/src/services/cards/cardSorting'
import './set-catalog.css'

interface SetCardGridProps {
  setCode: string
  setName: string
  cards: any[]
  spoiledNormalCount: number
  totalNormalCount: number
}

/**
 * Comparator for the set page.
 *
 * Mirrors the default aspect sort (aspect → type → cost → name) used elsewhere
 * in the app, with one twist: placeholders sit at the END of their aspect
 * bucket. We don't know placeholders' collector numbers, but we do know their
 * aspect, so we infer their position by treating them as if their name comes
 * after every real card in that aspect — exactly as the user described.
 *
 * Sub-sort within placeholders: rarity → group → bucket label, so equivalent
 * unknown slots cluster together (e.g. all the Common Vigilance Unknowns sit
 * next to each other).
 */
const RARITY_ORDER: Record<string, number> = {
  Common: 1,
  Uncommon: 2,
  Rare: 3,
  Legendary: 4,
  Special: 5,
}

const GROUP_ORDER: Record<string, number> = {
  leader: 1,
  base: 2,
  main: 3,
}

function isLeader(card: any): boolean {
  return Boolean(card.isLeader) || card.type === 'Leader'
}

function compareCatalogCards(a: any, b: any): number {
  // Leaders ALWAYS go first (real and placeholder). The deck's centerpiece
  // sits at the top of the page no matter the aspect.
  const leaderA = isLeader(a) ? 0 : 1
  const leaderB = isLeader(b) ? 0 : 1
  if (leaderA !== leaderB) return leaderA - leaderB

  // Aspect bucket — same key function used by the deck builder's default sort.
  const aspectCmp = getAspectSortKey(a).localeCompare(getAspectSortKey(b))
  if (aspectCmp !== 0) return aspectCmp

  // Placeholders go AFTER real cards within their aspect bucket.
  if (a.isPlaceholder !== b.isPlaceholder) {
    return a.isPlaceholder ? 1 : -1
  }

  if (a.isPlaceholder && b.isPlaceholder) {
    // Within placeholders: stable, predictable clustering.
    const rarityCmp = (RARITY_ORDER[a.rarity] || 99) - (RARITY_ORDER[b.rarity] || 99)
    if (rarityCmp !== 0) return rarityCmp
    const groupCmp = (GROUP_ORDER[a.placeholderGroup] || 99) - (GROUP_ORDER[b.placeholderGroup] || 99)
    if (groupCmp !== 0) return groupCmp
    const labelA = a.placeholderBucketLabel || a.name || ''
    const labelB = b.placeholderBucketLabel || b.name || ''
    const labelCmp = labelA.localeCompare(labelB)
    if (labelCmp !== 0) return labelCmp
    return (a.placeholderSlotIndex || 0) - (b.placeholderSlotIndex || 0)
  }

  // Real cards: standard default sort tail — type, cost, name.
  const typeCmp = getTypeOrder(a.type || '') - getTypeOrder(b.type || '')
  if (typeCmp !== 0) return typeCmp
  const costA = a.cost ?? 999
  const costB = b.cost ?? 999
  if (costA !== costB) return costA - costB
  return (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase())
}

export default function SetCardGrid({
  setCode,
  setName,
  cards,
  spoiledNormalCount,
  totalNormalCount,
}: SetCardGridProps) {
  const sortedCards = useMemo(() => [...cards].sort(compareCatalogCards), [cards])

  return (
    <main className="set-catalog-page">
      <header className="set-catalog-header">
        <a className="set-catalog-back" href="/">← Home</a>
        <h1 className="set-catalog-title">{setName}</h1>
        <p className="set-catalog-progress-line">
          <strong>{spoiledNormalCount.toLocaleString()}</strong>
          {' / '}
          <strong>{totalNormalCount.toLocaleString()}</strong>
          {' cards spoiled'}
        </p>
        <div className="set-catalog-progress-bar" aria-hidden="true">
          <span
            style={{
              width: totalNormalCount
                ? `${Math.min(100, Math.round((spoiledNormalCount / totalNormalCount) * 100))}%`
                : '0%',
            }}
          />
        </div>
      </header>

      <section className="set-catalog-grid" aria-label={`${setName} cards`}>
        {sortedCards.map(card =>
          // Real spoiled cards (have an image) get the standard preview:
          // hover on desktop, long-press on touch, with front/back side-by-side
          // for leaders. Placeholders have no image, so plain Card with no
          // preview interaction.
          card.imageUrl ? (
            <CardWithPreview key={card.id} card={card} />
          ) : (
            <Card key={card.id} card={card} aspectsAsIcons />
          ),
        )}
      </section>
    </main>
  )
}
