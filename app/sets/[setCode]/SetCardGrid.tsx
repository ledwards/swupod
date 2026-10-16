// @ts-nocheck
'use client'

import { useMemo } from 'react'
import Card from '@/src/components/Card'
import CardWithPreview from '@/src/components/CardWithPreview'
import SetPagePromoBanner from '@/src/components/SetPagePromoBanner'
import { compareCatalogCards } from '@/src/services/cards/setCatalog'
import './set-catalog.css'

interface SetCardGridProps {
  setCode: string
  setName: string
  cards: any[]
  spoiledNormalCount: number
  totalNormalCount: number
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
      <SetPagePromoBanner setCode={setCode} />
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
