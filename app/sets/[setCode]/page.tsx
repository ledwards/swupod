// @ts-nocheck
import { notFound } from 'next/navigation'
import { getCardsBySet, getCardMetadata } from '@/src/utils/cardData'
import { buildSetSpoilerOverview } from '@/src/services/cards/setSpoilerOverview'
import SetSpoilerCatalog from './SetSpoilerCatalog'
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
    title: `${setName} Catalog - Protect the Pod`,
    description: `Spoiler progress and card inventory for ${setName}.`,
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
  const overview = buildSetSpoilerOverview(normalizedSetCode, cards, metadata)

  return <SetSpoilerCatalog overview={overview} />
}
