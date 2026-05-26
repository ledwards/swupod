// @ts-nocheck
import { useState, useEffect, useRef, type MouseEvent } from 'react'
import './SealedPod.css'
import { getCachedCards, isCacheInitialized } from '../utils/cardCache'
import { fetchSetCards } from '../utils/api'
import { getBaseSetCode } from '../utils/carboniteConstants'
import { generateSealedPod } from '../utils/boosterPack'
import { savePool, updatePool } from '../utils/poolApi'
import { getDefaultPoolName, getCanonicalPoolSubtitle } from '../utils/deckBuilderSharing'
import { useAuth } from '../contexts/AuthContext'
import { getSetConfig } from '../utils/setConfigs'
import { getPackArtUrl } from '../utils/packArt'
import { trackEvent, AnalyticsEvents } from '../hooks/useAnalytics'
import EditableTitle from './EditableTitle'
import Button from './Button'
import DraftReportButton from './DraftReportButton'

interface Card {
  id?: string
  name?: string
  imageUrl?: string
  backImageUrl?: string
  rarity?: string
  isLeader?: boolean
  isBase?: boolean
  isFoil?: boolean
  isHyperspace?: boolean
  isShowcase?: boolean
}

interface Pack {
  name?: string
  cards: Card[]
}

interface Tooltip {
  show: boolean
  text: string
  x: number
  y: number
  alignLeft?: boolean
}

interface HoveredCardPreview {
  card: Card
  x: number
  y: number
}

export interface SealedPodProps {
  setCode: string
  onBack?: () => void
  onBuildDeck?: (cards: Card[], setCode: string) => void
  onPacksGenerated?: (packs: Pack[], setCode: string) => void
  initialPacks?: Pack[] | null
  shareId?: string | null
  poolType?: 'sealed' | 'draft'
  setName?: string | null
  poolName?: string | null
  createdAt?: string | null
  isLoading?: boolean
  poolOwnerId?: string | null
  poolOwnerUsername?: string | null
  draftShareId?: string | null
  isDefaultName?: boolean
}

// Helper function to get set name from set code
function getSetName(setCode: string) {
  const config = getSetConfig(setCode)
  return config?.setName || setCode
}

// Helper function to get set color from set code
function getSetColor(setCode: string) {
  const config = getSetConfig(setCode)
  return config?.color || '#ffffff'
}

function SealedPod({ setCode, onBack, onBuildDeck, onPacksGenerated, initialPacks = null, shareId = null, poolType = 'sealed', setName = null, poolName: initialPoolName = null, createdAt = null, isLoading = false, poolOwnerId = null, poolOwnerUsername = null, draftShareId = null, isDefaultName = false }: SealedPodProps) {
  const { user, isPatron } = useAuth()
  const [cards, setCards] = useState<Card[]>([])
  const [packs, setPacks] = useState<Pack[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [poolName, setPoolName] = useState<string | null>(initialPoolName)

  const [hoveredCardPreview, setHoveredCardPreview] = useState<HoveredCardPreview | null>(null)
  const [savedShareId, setSavedShareId] = useState<string | null>(shareId)
  const [saving, setSaving] = useState(false)
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [tooltip, setTooltip] = useState<Tooltip>({ show: false, text: '', x: 0, y: 0 })
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Determine if current user is the owner
  const isOwner = user && poolOwnerId && user.id === poolOwnerId

  const handleRenamePool = async (newName: string) => {
    if (!savedShareId) return
    try {
      await updatePool(savedShareId, { name: newName })
      setPoolName(newName)
    } catch (err) {
      console.error('Failed to rename pool:', err)
    }
  }

  useEffect(() => {
    // Skip loading cards if we have initialPacks (pool data from URL)
    if (initialPacks && initialPacks.length > 0) {
      // Extract cards from packs for card lookup/display purposes
      const allCardsFromPacks = initialPacks.flatMap(pack => pack.cards)
      setCards(allCardsFromPacks)
      setError(null) // Clear any error since we have pool data
      setLoading(false)
      return
    }

    const loadCards = async () => {
      try {
        setLoading(true)

        // First try to get from cache (fast, no loading)
        // Strip -CB suffix for carbonite codes (e.g. 'JTL-CB' -> 'JTL')
        const baseCode = getBaseSetCode(setCode)
        let cardsData: Card[] = []
        if (isCacheInitialized()) {
          cardsData = getCachedCards(baseCode)
        }

        // If cache doesn't have cards, try API as fallback
        if (cardsData.length === 0) {
          cardsData = await fetchSetCards(baseCode)
        }

        if (cardsData.length === 0) {
          // Only set error if we don't have initialPacks (which means we have pool data)
          // If we have initialPacks, we don't need cards from cache/API
          if (!initialPacks || initialPacks.length === 0) {
            setError(`No card data available for set ${setCode}. Please populate src/data/cards.json with card data.`)
          }
          setCards([])
        } else {
          setCards(cardsData)
        }
      } catch (err: unknown) {
        // Only set error if we don't have initialPacks
        if (!initialPacks || initialPacks.length === 0) {
          setError((err as Error).message)
        }
        setCards([])
      } finally {
        setLoading(false)
      }
    }
    loadCards()
  }, [setCode, initialPacks])

  // Cleanup preview timeout
  useEffect(() => {
    return () => {
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current)
      }
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current)
      }
    }
  }, [])

  // Tooltip handlers
  const showTooltip = (text: string, event: MouseEvent) => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current)
    }
    const rect = event.currentTarget.getBoundingClientRect()
    setTooltip({
      show: true,
      text,
      x: rect.left,
      y: rect.top + rect.height / 2,
      alignLeft: true
    })
    // Auto-hide after 2 seconds
    tooltipTimeoutRef.current = setTimeout(() => {
      setTooltip({ show: false, text: '', x: 0, y: 0, alignLeft: false })
    }, 2000)
  }

  const hideTooltip = () => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current)
      tooltipTimeoutRef.current = null
    }
    setTooltip({ show: false, text: '', x: 0, y: 0, alignLeft: false })
  }

  useEffect(() => {
    // If initialPacks provided (from URL), use those
    if (initialPacks && initialPacks.length > 0) {
      setPacks(initialPacks)
      setLoading(false)
      return
    }

    // Check if we have saved packs in sessionStorage
    const savedSealedPod = sessionStorage.getItem('sealedPod')
    if (savedSealedPod) {
      try {
        const data = JSON.parse(savedSealedPod)
        if (data.setCode === setCode && data.packs) {
          setPacks(data.packs)
          setLoading(false)
          return
        }
      } catch (e) {
        console.error('Failed to load saved sealed pod:', e)
      }
    }

    // Generate new packs if no saved data
    if (cards.length > 0) {
      const generatedPacks = generateSealedPod(cards, setCode)
      setPacks(generatedPacks)
      // Notify parent to save
      if (onPacksGenerated) {
        onPacksGenerated(generatedPacks, setCode)
      }
      // Auto-save to database if user is logged in
      autoSavePool(generatedPacks, setCode)
    }
  }, [cards, setCode, onPacksGenerated, initialPacks])

  // Auto-save pool to database when packs are generated
  const autoSavePool = async (generatedPacks: Pack[], setCode: string) => {
    if (!user || savedShareId) {
      // Don't save if not logged in or already saved
      return
    }

    try {
      setSaving(true)
      const allCards = generatedPacks.flatMap(pack => pack.cards)
      const defaultName = getDefaultPoolName({
        ownerName: user.username,
        setCode,
        poolType: 'sealed',
        createdAt: new Date(),
      })
      const poolData = {
        setCode,
        cards: allCards,
        packs: generatedPacks,
        poolType: 'sealed',
        isPublic: false,
        name: defaultName,
        deckBuilderState: { poolName: defaultName, isDefaultName: true },
      }

      const saved = await savePool(poolData)
      setSavedShareId(saved.shareId)

      // Track pool creation
      trackEvent(AnalyticsEvents.SEALED_POOL_CREATED, {
        set_code: setCode,
        pack_count: generatedPacks.length,
        card_count: allCards.length,
      })

      // Update URL without page reload
      const newUrl = `/pool/${saved.shareId}`
      window.history.replaceState({}, '', newUrl)

    } catch (error) {
      console.error('Failed to auto-save pool:', error)
      // Don't show error to user - silent fail is okay
    } finally {
      setSaving(false)
    }
  }


  const getRarityColor = (rarity?: string) => {
    switch (rarity) {
      case 'Common':
        return '#999'
      case 'Uncommon':
        return '#4CAF50'
      case 'Rare':
        return '#2196F3'
      case 'Legendary':
        return '#FF9800'
      default:
        return '#666'
    }
  }

  // Show loading placeholder for packs if isLoading prop is true
  const showPacksLoading = isLoading && (!packs || packs.length === 0)

  const packArtUrl = setCode ? getPackArtUrl(setCode) : null
  const setArtStyle = packArtUrl ? {
    backgroundImage: `url("${packArtUrl}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center center',
    backgroundRepeat: 'no-repeat'
  } : {}

  // Only show full loading screen if we're loading cards AND don't have initialPacks
  if (loading && !initialPacks && !isLoading) {
    return (
      <div className="sealed-pod">
        {packArtUrl && (
          <div className="set-art-header" style={setArtStyle}></div>
        )}
        <div className="sealed-pod-content">
          <div className="loading"></div>
        </div>
      </div>
    )
  }

  // Don't show error if:
  // 1. We have initialPacks (pool data from URL)
  // 2. We're still loading (isLoading)
  // 3. We have packs already loaded
  // Only show error if we don't have packs AND we're not loading AND we don't have initialPacks
  if ((error || cards.length === 0) && (!packs || packs.length === 0) && !isLoading && !initialPacks) {
    return (
      <div className="sealed-pod">
        {packArtUrl && (
          <div className="set-art-header" style={setArtStyle}></div>
        )}
        <div className="sealed-pod-content">
          <div className="error">
            <h2>No Card Data Available</h2>
            <p>{error || `No cards found for set ${setCode}.`}</p>
            <p>To use this app, you need to populate <code>src/data/cards.json</code> with card data.</p>
            <p>Each card should have the following structure:</p>
            <pre style={{ textAlign: 'left', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', overflow: 'auto' }}>
{`{
  "id": "unique-card-id",
  "name": "Card Name",
  "set": "SOR",
  "rarity": "Common",
  "type": "Unit",
  "aspects": ["Villainy", "Command"],
  "cost": 3,
  "isLeader": false,
  "isBase": false,
  "imageUrl": "https://..."
}`}
            </pre>
          </div>
          <Button variant="back" onClick={onBack}>Go Back</Button>
        </div>
      </div>
    )
  }

  const handleRefresh = () => {
    // Navigate to /pools/new?set=SETCODE to generate a new pool
    if (setCode) {
      window.location.href = `/pools/new?set=${setCode}`
    }
  }

  return (
    <div className={`sealed-pod ${poolType === 'draft' ? 'draft-mode' : 'sealed-mode'}`}>
      {packArtUrl && (
        <div className="set-art-header" style={setArtStyle}></div>
      )}
      <div className="sealed-pod-content">
        <div className="sealed-pod-header">
        <h1>
          <EditableTitle
            value={poolName}
            onSave={handleRenamePool}
            isEditable={isOwner && poolType !== 'draft'}
            placeholder={poolType === 'draft' ? 'Draft Pool' : 'Sealed Pool'}
          />
        </h1>
        {!isDefaultName && (
          <p className="pool-owner-byline">
            {getCanonicalPoolSubtitle({ ownerName: poolOwnerUsername, setCode, poolType, createdAt })}
          </p>
        )}
        {saving && <p className="saving-indicator"></p>}
        {packs.length > 0 && (
          <Button
            variant="primary"
            className="build-deck-button"
            onClick={() => {
              const allCards = packs.flatMap(pack => pack.cards)
              if (savedShareId) {
                // Navigate to deck builder with share ID
                window.location.href = `/pool/${savedShareId}/deck`
              } else if (onBuildDeck) {
                onBuildDeck(allCards, setCode)
              }
            }}
          >
            Build Deck
          </Button>
        )}
        {draftShareId && (
          <Button
            variant="secondary"
            className="draft-log-button"
            onClick={() => { window.location.href = `/draft/${draftShareId}/log` }}
          >
            Draft Log
          </Button>
        )}
        {draftShareId && isPatron && isOwner && (
          <DraftReportButton draftShareId={draftShareId} variant="pool" />
        )}
      </div>

      <div className="packs-container">
        {showPacksLoading ? (
          <div className="loading"></div>
        ) : (
          packs.map((pack, index) => (
          <div key={index} className="pack-details">
            <h2>{pack.name || `${poolType === 'draft' ? 'Round' : 'Pack'} ${index + 1}`}</h2>
            <div className="cards-grid">
              {pack.cards.map((card, cardIndex) => (
                <div
                  key={cardIndex}
                  className={`card-item ${card.isLeader || card.type === 'Leader' ? 'leader' : ''} ${card.isBase || card.type === 'Base' ? 'base' : ''} ${card.isFoil ? 'foil' : ''} ${card.isHyperspace ? 'hyperspace' : ''} ${card.isShowcase ? 'showcase' : ''} ${card.isPlaceholder ? 'placeholder-card' : ''}`}

                  onMouseEnter={(e) => {
                    // DISABLE enlarged preview on mobile/touch devices
                    if (window.innerWidth <= 768 || 'ontouchstart' in window || navigator.maxTouchPoints > 0) {
                      return
                    }

                    // Clear any existing timeout
                    if (previewTimeoutRef.current) {
                      clearTimeout(previewTimeoutRef.current)
                    }

                    // Capture the rect immediately (before timeout)
                    const rect = e.currentTarget.getBoundingClientRect()

                    // Set timeout to show preview after hovering
                    previewTimeoutRef.current = setTimeout(() => {
                      // Position the preview near the card (to the right, or left if too close to right edge)
                      let previewX = rect.right + 20
                      const previewY = rect.top

                      // Calculate preview dimensions based on card type
                      // Leaders and bases are landscape: 168px x 120px, so 3x = 504px x 360px
                      // Regular cards are portrait: 120px x 168px, so 3x = 360px x 504px
                      // Leaders with back: front horizontal (504x360) + back vertical (360x504) side by side
                      const isHorizontal = card.isLeader || card.type === 'Leader' || card.isBase || card.type === 'Base'
                      const hasBackImage = card.backImageUrl && card.isLeader
                      let previewWidth: number, previewHeight: number
                      if (hasBackImage) {
                        // Leader with back: side by side (horizontal front + vertical back)
                        previewWidth = 504 + 360 + 20 // 504px front + 360px back + 20px gap
                        previewHeight = 504 // Max height (vertical back is 504px)
                      } else {
                        previewWidth = isHorizontal ? 504 : 360
                        previewHeight = isHorizontal ? 360 : 504
                      }

                      // Ensure preview stays within viewport bounds
                      // Check right edge
                      if (previewX + previewWidth > window.innerWidth) {
                        // Try positioning to the left of the card
                        previewX = rect.left - previewWidth - 20
                        // If still off screen to the left, clamp to left edge
                        if (previewX < 0) {
                          previewX = 10 // Small margin from left edge
                        }
                      }

                      // Check left edge
                      if (previewX < 0) {
                        previewX = 10 // Small margin from left edge
                      }

                      // Adjust vertical position to keep preview within viewport
                      // previewY is the center point (due to translateY(-50%))
                      const previewTop = previewY - previewHeight / 2
                      const previewBottom = previewY + previewHeight / 2
                      let adjustedY = previewY

                      // Check top edge
                      if (previewTop < 0) {
                        adjustedY = previewHeight / 2 + 10 // Position so top is 10px from top
                      }

                      // Check bottom edge
                      if (previewBottom > window.innerHeight) {
                        adjustedY = window.innerHeight - previewHeight / 2 - 10 // Position so bottom is 10px from bottom
                      }

                      setHoveredCardPreview({ card, x: previewX, y: adjustedY })
                    }, 400)
                  }}
                  onMouseLeave={() => {
                    if (previewTimeoutRef.current) {
                      clearTimeout(previewTimeoutRef.current)
                      previewTimeoutRef.current = null
                    }
                    setHoveredCardPreview(null)
                  }}
                >
                  {card.imageUrl ? (
                    <img
                      src={card.imageUrl}
                      alt={card.name || 'Card'}
                      className="card-image"
                    />
                  ) : (
                    <div className="card-placeholder">
                      {card.isPlaceholder && (
                        <div className="placeholder-badge">Unknown</div>
                      )}
                      <div className="card-name">
                        {card.name || card.placeholderBucketLabel || 'Card'}
                      </div>
                      {card.isPlaceholder && (
                        <div className="placeholder-details">
                          {[
                            card.type && card.type !== 'Unknown' ? card.type : null,
                            ...(card.aspects || []),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      )}
                      <div className="card-rarity" style={{ color: getRarityColor(card.rarity) }}>
                        {card.rarity}
                      </div>
                    </div>
                  )}
                  <div className="card-badges">
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
        )}
      </div>



      {/* Enlarged card preview (3x size) */}
      {hoveredCardPreview && (() => {
        const card = hoveredCardPreview.card
        const hasBackImage = card.backImageUrl && card.isLeader
        const isHorizontal = card.isLeader || card.type === 'Leader' || card.isBase || card.type === 'Base'
        const borderRadius = '12px'

        // Calculate dimensions
        let previewWidth: number, previewHeight: number
        if (hasBackImage) {
          // Leader with back: side by side (horizontal front + vertical back)
          previewWidth = 504 + 360 + 20 // 504px front + 360px back + 20px gap
          previewHeight = 504 // Max height (vertical back is 504px)
        } else {
          // Leaders and bases are landscape: 168px x 120px, so 3x = 504px x 360px
          // Regular cards are portrait: 120px x 168px, so 3x = 360px x 504px
          previewWidth = isHorizontal ? 504 : 360
          previewHeight = isHorizontal ? 360 : 504
        }

        return (
          <div
            className="card-preview-enlarged"
            style={{
              position: 'fixed',
              left: `${hoveredCardPreview.x}px`,
              top: `${hoveredCardPreview.y}px`,
              zIndex: 9999,
              pointerEvents: 'auto',
              transform: 'translateY(-50%)',
              width: `${previewWidth}px`,
              height: `${previewHeight}px`,
              borderRadius: borderRadius,
              overflow: 'visible', // Changed to visible so side-by-side cards aren't clipped
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)',
              border: 'none', // Remove border from container
              display: 'flex',
              flexDirection: 'row', // Side by side for leaders with back
              gap: '20px',
            }}
            onMouseLeave={() => setHoveredCardPreview(null)}
          >
            {hasBackImage ? (
              // Show both front (horizontal) and back (vertical) side by side for leaders
              <>
                {/* Front - horizontal */}
                <div className={(card.isFoil && !card.isLeader) || card.isShowcase ? 'card-preview-foil' : ''} style={{
                  width: '504px',
                  height: '360px',
                  overflow: 'hidden',
                  borderRadius: borderRadius,
                  boxShadow: ((card.isFoil && !card.isLeader) || card.isShowcase) ? '0 0 15px rgba(255, 255, 255, 0.5)' : '0 8px 32px rgba(0, 0, 0, 0.8)',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  alignSelf: 'center', // Vertically center the front side
                  position: 'relative',
                }}>
                  {card.imageUrl ? (
                    <img
                      src={card.imageUrl}
                      alt={`${card.name || 'Card'} - Front`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                  ) : (
                    <div style={{
                      width: '100%',
                      height: '100%',
                      background: 'rgba(26, 26, 46, 0.95)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      alignItems: 'center',
                      padding: '1rem',
                      color: 'white',
                    }}>
                      <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
                        {card.name || 'Card'} - Front
                      </div>
                      <div style={{ color: getRarityColor(card.rarity) }}>
                        {card.rarity}
                      </div>
                    </div>
                  )}
                </div>
                {/* Back - vertical */}
                <div className={(card.isFoil && !card.isLeader) || card.isShowcase ? 'card-preview-foil' : ''} style={{
                  width: '360px',
                  height: '504px',
                  overflow: 'hidden',
                  borderRadius: borderRadius,
                  boxShadow: ((card.isFoil && !card.isLeader) || card.isShowcase) ? '0 0 15px rgba(255, 255, 255, 0.5)' : '0 8px 32px rgba(0, 0, 0, 0.8)',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  position: 'relative',
                }}>
                  {card.backImageUrl ? (
                    <img
                      src={card.backImageUrl}
                      alt={`${card.name || 'Card'} - Back`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                      }}
                    />
                  ) : (
                    <div style={{
                      width: '100%',
                      height: '100%',
                      background: 'rgba(26, 26, 46, 0.95)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      alignItems: 'center',
                      padding: '1rem',
                      color: 'white',
                    }}>
                      <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
                        {card.name || 'Card'} - Back
                      </div>
                      <div style={{ color: getRarityColor(card.rarity) }}>
                        {card.rarity}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              // Single card (non-leader, base, or leader without back)
              <div className={(card.isFoil && !card.isLeader) || card.isShowcase ? 'card-preview-foil' : ''} style={{
                width: `${previewWidth}px`,
                height: `${previewHeight}px`,
                overflow: 'hidden',
                borderRadius: borderRadius,
                boxShadow: ((card.isFoil && !card.isLeader) || card.isShowcase) ? '0 0 15px rgba(255, 255, 255, 0.5)' : '0 8px 32px rgba(0, 0, 0, 0.8)',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                position: 'relative',
              }}>
                {card.imageUrl ? (
                  <img
                    src={card.imageUrl}
                    alt={card.name || 'Card'}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                ) : (
                  <div style={{
                    width: '100%',
                    height: '100%',
                    background: 'rgba(26, 26, 46, 0.95)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '1rem',
                    color: 'white',
                  }}>
                    <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
                      {card.name || 'Card'}
                    </div>
                    <div style={{ color: getRarityColor(card.rarity) }}>
                      {card.rarity}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })()}
      {tooltip.show && (
        <div
          className="tooltip"
          style={{
            position: 'fixed',
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
            transform: tooltip.alignLeft
              ? 'translateX(-100%) translateY(-50%)'
              : 'translateX(-50%) translateY(-100%)',
            zIndex: 10000,
            pointerEvents: 'none',
            marginRight: '20px',
            marginTop: tooltip.alignLeft ? '0' : '-8px'
          }}
        >
          {tooltip.text}
        </div>
      )}
      </div>
    </div>
  )
}

export default SealedPod
