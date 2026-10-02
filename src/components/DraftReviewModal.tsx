// @ts-nocheck
'use client'

import { useState, useMemo, useRef, useEffect, type MouseEvent } from 'react'
import {createPortal} from 'react-dom'
import './DraftReviewModal.css'
import TimerPanel from './TimerPanel'
import Button from './Button'
import CardZoom from './CardZoom'

interface Card {
  id: string
  name: string
  imageUrl?: string
  backImageUrl?: string
  cost?: number
  type?: string
  aspects?: string[]
  isLeader?: boolean
  isBase?: boolean
  isFoil?: boolean
}

interface CardWithPickInfo extends Card {
  pickNumber: number
  packNumber: number
  pickInPack: number
}

interface Draft {
  [key: string]: unknown
}

interface Player {
  [key: string]: unknown
}

interface HoveredCardPreview {
  card: CardWithPickInfo
}

export interface DraftReviewModalProps {
  /** Optional heading (e.g. a player's name when viewing someone else's picks). */
  title?: string
  draftedCards?: Card[]
  draftedLeaders?: Card[]
  onClose: () => void
  packSize?: number
  draft?: Draft
  players?: Player[]
  isHost?: boolean
  onTogglePause?: () => void
  onTimerExpire?: () => void
}

function DraftReviewModal({ title, draftedCards = [], draftedLeaders = [], onClose, packSize = 14, draft, players = [], isHost = false, onTogglePause, onTimerExpire }: DraftReviewModalProps) {
  const [sortMode, setSortMode] = useState<'pick' | 'cost' | 'type' | 'aspect'>('pick')
  const [groupMode, setGroupMode] = useState<'none' | 'cost' | 'type' | 'aspect'>('none')
  const [hoveredCardPreview, setHoveredCardPreview] = useState<HoveredCardPreview | null>(null)
  // This list is where a player goes to re-read what they drafted, and the
  // hover preview below is desktop-only — so a card also opens full size on
  // tap/click. Without it every card here is inert on a phone.
  const [zoomedCard, setZoomedCard] = useState<Card | null>(null)
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openZoom = (card: Card) => {
    handleCardMouseLeave()
    setZoomedCard(card)
  }

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // The zoom sits on top of this modal and closes itself on Escape; without
      // this both would close on the one keypress.
      if (zoomedCard) return
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, zoomedCard])

  // Get aspect key for grouping (same logic as DeckBuilder)
  const getAspectKey = (card: Card) => {
    const aspects = card.aspects || []
    if (aspects.length === 0) return 'ZZZ_Neutral'

    if (aspects.length === 1) {
      const aspect = aspects[0]
      const priority: Record<string, string> = {
        'Vigilance': 'A_Vigilance',
        'Command': 'B_Command',
        'Aggression': 'C_Aggression',
        'Cunning': 'D_Cunning',
      }
      return priority[aspect] || `E_${aspect}`
    }

    // Multi-aspect cards
    const sortedAspects = [...aspects].sort()
    return `F_${sortedAspects.join('/')}`
  }

  const getAspectLabel = (key: string) => {
    if (key === 'ZZZ_Neutral') return 'Neutral'
    if (key.startsWith('A_')) return 'Vigilance'
    if (key.startsWith('B_')) return 'Command'
    if (key.startsWith('C_')) return 'Aggression'
    if (key.startsWith('D_')) return 'Cunning'
    if (key.startsWith('F_')) return key.substring(2) // Multi-aspect
    return key
  }

  // Get card type for grouping
  const getTypeKey = (card: Card) => {
    const type = card.type || 'Unknown'
    const priority: Record<string, string> = {
      'Leader': 'A_Leader',
      'Base': 'B_Base',
      'Unit': 'C_Unit',
      'Upgrade': 'D_Upgrade',
      'Event': 'E_Event',
    }
    return priority[type] || `F_${type}`
  }

  const getTypeLabel = (key: string) => {
    if (key.startsWith('A_')) return 'Leader'
    if (key.startsWith('B_')) return 'Base'
    if (key.startsWith('C_')) return 'Unit'
    if (key.startsWith('D_')) return 'Upgrade'
    if (key.startsWith('E_')) return 'Event'
    if (key.startsWith('F_')) return key.substring(2)
    return key
  }

  // Calculate pack and pick for each card
  const cardsWithPickInfo = useMemo((): CardWithPickInfo[] => {
    return draftedCards.map((card, index) => {
      // Total picks = 3 rounds × 14 cards each
      // Cards are in order picked, so index 0 = first pick
      const pickNumber = index + 1
      const packNumber = Math.floor(index / 14) + 1
      const pickInPack = (index % 14) + 1

      return {
        ...card,
        pickNumber,
        packNumber,
        pickInPack,
      }
    })
  }, [draftedCards])

  // Sort and group cards based on mode
  const { groups, sortedCards } = useMemo(() => {
    if (groupMode === 'none') {
      // Group by round in pick order mode
      const roundGroups: Record<string, CardWithPickInfo[]> = {}

      cardsWithPickInfo.forEach(card => {
        const roundKey = `Round ${card.packNumber}`
        if (!roundGroups[roundKey]) roundGroups[roundKey] = []
        roundGroups[roundKey].push(card)
      })

      return { groups: roundGroups, sortedCards: null }
    }

    if (groupMode === 'cost') {
      // Group by cost
      const costGroups: Record<string | number, CardWithPickInfo[]> = {}
      const costSegments: (number | string)[] = [0, 1, 2, 3, 4, 5, 6, 7, '8+']

      costSegments.forEach(segment => {
        costGroups[segment] = []
      })

      cardsWithPickInfo.forEach(card => {
        const cost = card.cost ?? 0
        let segment: number | string = cost
        if (cost >= 8) segment = '8+'
        if (!costGroups[segment]) costGroups[segment] = []
        costGroups[segment].push(card)
      })

      return { groups: costGroups, sortedCards: null }
    }

    if (groupMode === 'type') {
      // Group by card type
      const typeGroups: Record<string, CardWithPickInfo[]> = {}

      cardsWithPickInfo.forEach(card => {
        const key = getTypeKey(card)
        if (!typeGroups[key]) typeGroups[key] = []
        typeGroups[key].push(card)
      })

      // Sort groups by key
      const sortedKeys = Object.keys(typeGroups).sort()
      const sortedGroups: Record<string, CardWithPickInfo[]> = {}
      sortedKeys.forEach(key => {
        sortedGroups[key] = typeGroups[key].sort((a, b) => (a.cost || 0) - (b.cost || 0))
      })

      return { groups: sortedGroups, sortedCards: null }
    }

    if (groupMode === 'aspect') {
      // Group by aspect
      const aspectGroups: Record<string, CardWithPickInfo[]> = {}

      cardsWithPickInfo.forEach(card => {
        const key = getAspectKey(card)
        if (!aspectGroups[key]) aspectGroups[key] = []
        aspectGroups[key].push(card)
      })

      // Sort groups by key
      const sortedKeys = Object.keys(aspectGroups).sort()
      const sortedGroups: Record<string, CardWithPickInfo[]> = {}
      sortedKeys.forEach(key => {
        sortedGroups[key] = aspectGroups[key].sort((a, b) => (a.cost || 0) - (b.cost || 0))
      })

      return { groups: sortedGroups, sortedCards: null }
    }

    return { groups: null, sortedCards: cardsWithPickInfo }
  }, [cardsWithPickInfo, groupMode])

  const handleCardMouseEnter = (_e: MouseEvent, card: CardWithPickInfo) => {
    // Disable hover preview on mobile
    if (window.innerWidth <= 768 || 'ontouchstart' in window || navigator.maxTouchPoints > 0) {
      return
    }

    // Clear any existing timeout
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current)
    }

    // Both faces share a viewport-centered preview, independent of card location.
    previewTimeoutRef.current = setTimeout(() => {
      setHoveredCardPreview({card})
    }, 500)
  }

  const handleCardMouseLeave = () => {
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current)
    }
    setHoveredCardPreview(null)
  }

  const renderCard = (card: CardWithPickInfo) => (
    <div
      key={`${card.id}-${card.pickNumber}`}
      className="review-card"
      role="button"
      tabIndex={0}
      aria-label={`${card.name || 'Card'} — enlarge`}
      onClick={() => openZoom(card)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        openZoom(card)
      }}
      onMouseEnter={(e) => handleCardMouseEnter(e, card)}
      onMouseLeave={handleCardMouseLeave}
    >
      <img src={card.imageUrl} alt={card.name} className="review-card-image" />
    </div>
  )

  return createPortal(
    <div className="draft-review-overlay" onClick={onClose}>
      <div className="modal-content draft-review-modal" role="dialog" aria-modal="true" aria-label={title || "Your drafted cards"} onClick={(e) => e.stopPropagation()}>
        <div className="review-controls">
          <div className="review-controls-left">
            <h3 className="review-controls-heading">Group By</h3>
            <Button
              variant="toggle"
              active={sortMode === 'pick'}
              onClick={() => { setSortMode('pick'); setGroupMode('none'); }}
            >
              Pick Order
            </Button>
            <Button
              variant="toggle"
              active={groupMode === 'cost'}
              onClick={() => { setSortMode('cost'); setGroupMode('cost'); }}
            >
              Cost
            </Button>
            <Button
              variant="toggle"
              active={groupMode === 'type'}
              onClick={() => { setSortMode('type'); setGroupMode('type'); }}
            >
              Type
            </Button>
            <Button
              variant="toggle"
              active={groupMode === 'aspect'}
              onClick={() => { setSortMode('aspect'); setGroupMode('aspect'); }}
            >
              Aspect
            </Button>
          </div>
          <div className="review-controls-center">
            {draft && players ? (
              <TimerPanel draft={draft} players={players} compact={false} isHost={isHost} onTogglePause={onTogglePause} onTimerExpire={onTimerExpire} />
            ) : title ? (
              <h2 className="draft-review-title">{title}</h2>
            ) : null}
          </div>
          <div className="review-controls-right">
            <Button variant="danger" size="sm" className="draft-review-close" onClick={onClose} aria-label="Close card review" title="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </Button>
          </div>
        </div>

        <div className="review-content">
          {draftedLeaders.length > 0 && (
            <div className="review-section">
              <h3>Leaders</h3>
              <div className="review-leaders">
                {draftedLeaders.map((leader, idx) => (
                  <div
                    key={idx}
                    className="review-leader"
                    role="button"
                    tabIndex={0}
                    aria-label={`${leader.name || 'Leader'} — enlarge`}
                    onClick={() => openZoom(leader as Card)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return
                      e.preventDefault()
                      openZoom(leader as Card)
                    }}
                    onMouseEnter={(e) => handleCardMouseEnter(e, leader as CardWithPickInfo)}
                    onMouseLeave={handleCardMouseLeave}
                  >
                    <img src={leader.imageUrl} alt={leader.name} className="review-leader-image" />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="review-section">
            <h3>Cards ({draftedCards.length})</h3>
            {groups && Object.entries(groups).map(([groupKey, groupCards]) => {
              if (groupCards.length === 0) return null

              const label = groupMode === 'none'
                ? groupKey
                : groupMode === 'cost'
                ? groupKey
                : groupMode === 'type'
                ? getTypeLabel(groupKey)
                : getAspectLabel(groupKey)

              return (
                <div key={groupKey} className="review-group">
                  <div className="review-group-header">
                    <div className="review-group-icon">
                      {groupMode === 'none' ? (
                        <span className="type-label">{label}</span>
                      ) : groupMode === 'cost' ? (
                        <div className="cost-icon-container">
                          <img src="/icons/cost.png" alt="Cost" className="cost-icon-image" />
                          <span className="cost-icon-number">{label}</span>
                        </div>
                      ) : groupMode === 'aspect' ? (
                        <div className="aspect-icon-container">
                          {label !== 'Neutral' && String(label).split('/').map((aspect, idx) => (
                            <img
                              key={idx}
                              src={`/icons/${aspect.toLowerCase()}.png`}
                              alt={aspect}
                              className="aspect-icon-image"
                            />
                          ))}
                          <span className="aspect-label">{label}</span>
                        </div>
                      ) : (
                        <span className="type-label">{label}</span>
                      )}
                    </div>
                    <span className="review-group-count">({groupCards.length})</span>
                  </div>
                  <div className="review-cards-grid">
                    {groupCards.map(renderCard)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {zoomedCard && (
          <CardZoom card={zoomedCard} onClose={() => setZoomedCard(null)} />
        )}

        {hoveredCardPreview && createPortal(
          <div className="review-hover-stage" aria-hidden="true">
            <div className={`card-preview-enlarged review-hover-cards${hoveredCardPreview.card.isLeader && hoveredCardPreview.card.backImageUrl ? ' review-hover-pair' : ''}`}>
              <img src={hoveredCardPreview.card.imageUrl} alt={`${hoveredCardPreview.card.name} (front)`} />
              {hoveredCardPreview.card.isLeader && hoveredCardPreview.card.backImageUrl &&
                <img src={hoveredCardPreview.card.backImageUrl} alt={`${hoveredCardPreview.card.name} (back)`} />}
            </div>
          </div>, document.body
        )}
      </div>
    </div>, document.body
  )
}

export default DraftReviewModal
