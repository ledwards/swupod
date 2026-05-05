// @ts-nocheck
'use client'

import { useEffect, useMemo, useState } from 'react'
import Button from '../Button'
import { getCachedCards } from '../../utils/cardCache'
import type { MatchedCard } from '../../hooks/useImportPool'

interface Props {
  setCode: string
  /** Pre-filtered candidates (e.g. ambiguous matches). If empty, shows full set. */
  candidates: MatchedCard[]
  /** Filter to a specific card type (Leader/Base/Unit/Event/Upgrade) */
  typeFilter?: string
  onPick: (card: MatchedCard) => void
  onClose: () => void
}

/**
 * CardPickerModal — search + select a card from the imported set (U8).
 *
 * Used by ResolveStep to fix unmatched/wrong-match rows. Uses Modal-style
 * overlay; relies on Modal.css if present, otherwise inline styles.
 */
export default function CardPickerModal({ setCode, candidates, typeFilter, onPick, onClose }: Props) {
  const [query, setQuery] = useState('')

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  // ESC key closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const allCards: MatchedCard[] = useMemo(() => {
    if (candidates.length > 0) return candidates
    const cards = getCachedCards(setCode) || []
    return cards
      .filter((c: any) => c.variantType === 'Normal')
      .filter((c: any) => !typeFilter || c.type === typeFilter)
      .map((c: any) => ({
        id: c.id,
        cardId: c.cardId,
        name: c.name,
        subtitle: c.subtitle,
        type: c.type,
        aspects: c.aspects,
        imageUrl: c.imageUrl,
        isLeader: !!c.isLeader,
        isBase: !!c.isBase,
      }))
  }, [setCode, candidates, typeFilter])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allCards.slice(0, 100)
    return allCards
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.subtitle?.toLowerCase().includes(q) ?? false) ||
          c.cardId.toLowerCase().includes(q),
      )
      .slice(0, 100)
  }, [allCards, query])

  return (
    <div className="import-pool-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="import-pool-modal" onClick={(e) => e.stopPropagation()}>
        <header className="import-pool-modal__header">
          <h3>{candidates.length > 0 ? 'Pick from candidates' : 'Pick a card'}</h3>
          <Button variant="icon" size="sm" onClick={onClose} aria-label="Close">
            ×
          </Button>
        </header>
        {candidates.length === 0 && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${setCode}${typeFilter ? ` ${typeFilter}s` : ' cards'}…`}
            className="import-pool-modal__search"
            autoFocus
          />
        )}
        <ul className="import-pool-modal__list">
          {filtered.map((card) => (
            <li key={card.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(card)
                  onClose()
                }}
                className="import-pool-modal__card-option"
              >
                {card.imageUrl && (
                  <img src={card.imageUrl} alt={card.name} loading="lazy" />
                )}
                <span>
                  <strong>{card.name}</strong>
                  {card.subtitle && <em> · {card.subtitle}</em>}
                  <small>
                    {card.cardId} · {card.type}
                  </small>
                </span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="import-pool-modal__empty">No matches</li>
          )}
        </ul>
      </div>
    </div>
  )
}
