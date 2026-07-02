'use client'

type CardLike = {
  id?: string | null
  cardId?: string | null
  card_id?: string | null
  name?: string | null
  cardName?: string | null
  title?: string | null
  subtitle?: string | null
  type?: string | null
  cardType?: string | null
  setCode?: string | null
  imageUrl?: string | null
  isLeader?: boolean
  isBase?: boolean
  isPlaceholder?: boolean
}

export function CardStatsBadge({
  card: _card,
  setCode: _setCode,
  className: _className = '',
}: {
  card: CardLike | null | undefined
  setCode?: string | null
  className?: string
}) {
  return null
}

export default CardStatsBadge
