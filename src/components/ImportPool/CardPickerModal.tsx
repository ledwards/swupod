// @ts-nocheck
'use client'

import { useEffect, useMemo, useState } from 'react'
import Button from '../Button'
import { getCachedCards } from '../../utils/cardCache'
import type { MatchedCard } from '../../hooks/useImportPool'
import type { ProcessedImage } from '../../services/importPool/imagePrep'

interface Props {
  setCode: string
  /** Pre-filtered candidates (e.g. ambiguous matches). If empty, shows full set. */
  candidates: MatchedCard[]
  /** Filter to a specific card type (Leader/Base/Unit/Event/Upgrade) */
  typeFilter?: string
  /** When provided, renders the source sheet next to the picker so the user
   *  can verify against the original. */
  sourceImages?: ProcessedImage[]
  onPick: (card: MatchedCard) => void
  onClose: () => void
}

/**
 * CardPickerModal — search + select a card from the imported set (U8).
 *
 * Two layouts:
 *   - Without sourceImages: single-panel picker (search + list)
 *   - With sourceImages:   two-panel modal — source image on left, picker on right.
 *     User verifies the row against the sheet without closing the modal.
 */
export default function CardPickerModal({
  setCode,
  candidates,
  typeFilter,
  sourceImages,
  onPick,
  onClose,
}: Props) {
  const [query, setQuery] = useState('')
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [imageZoomed, setImageZoomed] = useState(true) // default zoom IN since the picker is meant for verification

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

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

  const showImagePanel = !!sourceImages && sourceImages.length > 0
  const activeImage = showImagePanel ? sourceImages![activeImageIndex] : null

  return (
    <div
      className={`import-pool-modal-overlay ${showImagePanel ? 'ip-picker-overlay--with-image' : ''}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`import-pool-modal ${showImagePanel ? 'ip-picker-modal--with-image' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="import-pool-modal__header">
          <h3>{candidates.length > 0 ? 'Pick from candidates' : 'Pick a card'}</h3>
          <Button variant="icon" size="sm" onClick={onClose} aria-label="Close">
            ×
          </Button>
        </header>

        <div className={`ip-picker-body ${showImagePanel ? 'ip-picker-body--split' : ''}`}>
          {showImagePanel && activeImage && (
            <div className="ip-picker-image-panel">
              <div className="ip-picker-image-toolbar">
                {sourceImages!.length > 1 && (
                  <div className="ip-source-modal__tabs">
                    {sourceImages!.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`ip-source-modal__tab ${i === activeImageIndex ? 'ip-source-modal__tab--active' : ''}`}
                        onClick={() => setActiveImageIndex(i)}
                      >
                        Page {i + 1}
                      </button>
                    ))}
                  </div>
                )}
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => setImageZoomed((z) => !z)}
                >
                  {imageZoomed ? 'Fit' : 'Zoom'}
                </Button>
              </div>
              <div className={`ip-picker-image-viewport ${imageZoomed ? 'is-zoomed' : ''}`}>
                <img src={activeImage.previewUrl} alt="Source sheet" />
              </div>
            </div>
          )}

          <div className="ip-picker-list-panel">
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
                    {card.imageUrl && <img src={card.imageUrl} alt={card.name} loading="lazy" />}
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
      </div>
    </div>
  )
}
