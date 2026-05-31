// @ts-nocheck
import { notFound } from 'next/navigation'
import { getCardsBySet, getCardMetadata } from '@/src/utils/cardData'
import SetCardGrid from './SetCardGrid'
import './set-catalog.css'

export async function generateMetadata({ params }) {
  const { setCode } = await params
  const normalizedSetCode = String(setCode || '').toUpperCase()
  const metadata = getCardMetadata()
  const setMetadata = Array.isArray(metadata?.sets)
    ? metadata.sets.find(set => set.code === normalizedSetCode)
    : null
  const setName = setMetadata?.name || normalizedSetCode

  return {
    title: `${setName} — Protect the Pod`,
    description: `All ${setName} cards spoiled so far, with placeholders for unrevealed slots.`,
  }
}

export default async function SetCatalogPage({ params }) {
  const { setCode } = await params
  const normalizedSetCode = String(setCode || '').toUpperCase()
  const cards = getCardsBySet(normalizedSetCode)

  if (cards.length === 0) {
    notFound()
  }

  const metadata = getCardMetadata()
  const setMetadata = Array.isArray(metadata?.sets)
    ? metadata.sets.find(set => set.code === normalizedSetCode)
    : null
  const setName = setMetadata?.name || normalizedSetCode

  // Show Normal variant only — that's the one-row-per-card view a spoiler
  // page is expected to render. Foil/Hyperspace variants are duplicates of
  // the same underlying card and would clutter the grid.
  const normalCards = cards.filter(card => (card.variantType || 'Normal') === 'Normal')
  const spoiledNormalCount = normalCards.filter(card => !card.isPlaceholder).length
  const totalNormalCount = normalCards.length

  return (
    <SetCardGrid
      setCode={normalizedSetCode}
      setName={setName}
      cards={normalCards}
      spoiledNormalCount={spoiledNormalCount}
      totalNormalCount={totalNormalCount}
    />
  )
}
