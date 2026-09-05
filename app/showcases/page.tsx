// @ts-nocheck
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import html2canvas from 'html2canvas'
import { useAuth } from '../../src/contexts/AuthContext'
import { initializeCardCache, getCachedCards } from '../../src/utils/cardCache'
import { getAspectColor } from '../../src/utils/aspectColors'
import { getAllSetCodes } from '../../src/utils/setConfigs'
import Button from '../../src/components/Button'
import './showcases.css'

interface ShowcaseLeader {
  id: string
  cardId: string
  cardName: string
  cardSubtitle?: string
  setCode: string
}

interface CardData {
  id: string
  name: string
  subtitle?: string
  imageUrl?: string
  backImageUrl?: string
  aspects?: string[]
  isLeader?: boolean
  variantType?: string
}

interface CardPosition {
  x: number
  y: number
  rotation: number
  zIndex: number
}

export default function ShowcasesPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [showcases, setShowcases] = useState<ShowcaseLeader[]>([])
  const [cardsData, setCardsData] = useState<Record<string, CardData>>({})
  const [totalLeaders, setTotalLeaders] = useState(0)
  const [loadingShowcases, setLoadingShowcases] = useState(true)
  const [cardPositions, setCardPositions] = useState<Record<string, CardPosition>>({})
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({})
  const [draggingCard, setDraggingCard] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [hasDragged, setHasDragged] = useState(false)
  const [dragRotation, setDragRotation] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null)
  const lastPosRef = useRef({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)

  // Get card dimensions based on screen width
  const getCardDimensions = useCallback(() => {
    const isMobile = window.innerWidth <= 768
    return isMobile ? { width: 220, height: 157 } : { width: 294, height: 210 }
  }, [])

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      router.push('/')
    }
  }, [user, loading, router])

  // Fetch showcase leaders and card data
  useEffect(() => {
    if (!user) return

    const fetchShowcases = async () => {
      try {
        // Initialize card cache to get image URLs
        await initializeCardCache()

        // Build a map of card id -> card data for all sets and count unique showcase leaders
        const cardMap: Record<string, CardData> = {}
        const uniqueShowcaseLeaders = new Set<string>()
        // Every configured set (SET_CONFIGS is the single source of truth — never hardcode)
        getAllSetCodes().forEach(setCode => {
          const cards = getCachedCards(setCode) || []
          cards.forEach((card: CardData) => {
            cardMap[card.id] = card
            if (card.isLeader && card.variantType === 'Showcase') {
              // Use name + subtitle as unique key to avoid counting duplicates
              uniqueShowcaseLeaders.add(`${card.name}|${card.subtitle || ''}`)
            }
          })
        })
        setCardsData(cardMap)
        setTotalLeaders(uniqueShowcaseLeaders.size)

        const response = await fetch(`/api/users/${user.id}/showcase-leaders`)
        if (response.ok) {
          const result = await response.json()
          const leaders = result.data?.showcaseLeaders || result.showcaseLeaders || []
          setShowcases(leaders)

          // Initialize random positions for each card
          const positions: Record<string, CardPosition> = {}
          const containerWidth = window.innerWidth
          const containerHeight = window.innerHeight
          const { width: cardWidth, height: cardHeight } = getCardDimensions()
          const padding = 50

          leaders.forEach((leader: ShowcaseLeader, index: number) => {
            // Spread cards across the viewport with some randomness
            const gridCols = Math.ceil(Math.sqrt(leaders.length))
            const gridRows = Math.ceil(leaders.length / gridCols)
            const cellWidth = (containerWidth - padding * 2) / gridCols
            const cellHeight = (containerHeight - padding * 2) / gridRows

            const col = index % gridCols
            const row = Math.floor(index / gridCols)

            // Base position in grid cell with random offset
            const baseX = padding + col * cellWidth + (cellWidth - cardWidth) / 2
            const baseY = padding + row * cellHeight + (cellHeight - cardHeight) / 2

            // Add random offset and rotation
            const randomX = (Math.random() - 0.5) * cellWidth * 0.5
            const randomY = (Math.random() - 0.5) * cellHeight * 0.3
            const rotation = (Math.random() - 0.5) * 20 // -10 to 10 degrees

            positions[leader.id] = {
              x: Math.max(padding, Math.min(containerWidth - cardWidth - padding, baseX + randomX)),
              y: Math.max(padding, Math.min(containerHeight - cardHeight - padding, baseY + randomY)),
              rotation,
              zIndex: index + 1
            }
          })
          setCardPositions(positions)
        }
      } catch (error) {
        console.error('Failed to fetch showcases:', error)
      } finally {
        setLoadingShowcases(false)
      }
    }

    fetchShowcases()
  }, [user])

  // Handle card flip
  const handleCardClick = useCallback((cardId: string, e: React.MouseEvent) => {
    // Don't flip if we were dragging
    if (hasDragged) return

    setFlippedCards(prev => ({
      ...prev,
      [cardId]: !prev[cardId]
    }))
  }, [hasDragged])

  // Drag handlers
  const handleMouseDown = useCallback((cardId: string, e: React.MouseEvent) => {
    e.preventDefault()
    const card = e.currentTarget as HTMLElement
    const rect = card.getBoundingClientRect()

    setDraggingCard(cardId)
    setHasDragged(false)
    setDragRotation(0)
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
    lastPosRef.current = { x: e.clientX, y: e.clientY }

    // Bring card to front
    setCardPositions(prev => {
      const maxZ = Math.max(...Object.values(prev).map(p => p.zIndex || 0))
      return {
        ...prev,
        [cardId]: {
          ...prev[cardId],
          zIndex: maxZ + 1
        }
      }
    })
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingCard) return

    setHasDragged(true)

    // Calculate velocity for rotation effect
    const velocityX = e.clientX - lastPosRef.current.x
    lastPosRef.current = { x: e.clientX, y: e.clientY }

    // Apply rotation based on horizontal velocity (clamped to subtle range)
    const newRotation = Math.max(-8, Math.min(8, velocityX * 0.3))
    setDragRotation(newRotation)

    const containerWidth = window.innerWidth
    const containerHeight = window.innerHeight
    const { width: cardWidth, height: cardHeight } = getCardDimensions()

    setCardPositions(prev => ({
      ...prev,
      [draggingCard]: {
        ...prev[draggingCard],
        x: Math.max(0, Math.min(containerWidth - cardWidth, e.clientX - dragOffset.x)),
        y: Math.max(0, Math.min(containerHeight - cardHeight, e.clientY - dragOffset.y))
      }
    }))
  }, [draggingCard, dragOffset, getCardDimensions])

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (draggingCard) {
      e.preventDefault()
    }
    setDraggingCard(null)
    setDragRotation(0)
  }, [draggingCard])

  // Touch handlers for mobile
  const handleTouchStart = useCallback((cardId: string, e: React.TouchEvent) => {
    const touch = e.touches[0]
    const card = e.currentTarget as HTMLElement
    const rect = card.getBoundingClientRect()

    setDraggingCard(cardId)
    setHasDragged(false)
    setDragRotation(0)
    setDragOffset({
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    })
    lastPosRef.current = { x: touch.clientX, y: touch.clientY }

    setCardPositions(prev => {
      const maxZ = Math.max(...Object.values(prev).map(p => p.zIndex || 0))
      return {
        ...prev,
        [cardId]: {
          ...prev[cardId],
          zIndex: maxZ + 1
        }
      }
    })
  }, [])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!draggingCard) return

    setHasDragged(true)

    const touch = e.touches[0]

    // Calculate velocity for rotation effect
    const velocityX = touch.clientX - lastPosRef.current.x
    lastPosRef.current = { x: touch.clientX, y: touch.clientY }

    // Apply rotation based on horizontal velocity (clamped to subtle range)
    const newRotation = Math.max(-8, Math.min(8, velocityX * 0.3))
    setDragRotation(newRotation)

    const containerWidth = window.innerWidth
    const containerHeight = window.innerHeight
    const { width: cardWidth, height: cardHeight } = getCardDimensions()

    setCardPositions(prev => ({
      ...prev,
      [draggingCard]: {
        ...prev[draggingCard],
        x: Math.max(0, Math.min(containerWidth - cardWidth, touch.clientX - dragOffset.x)),
        y: Math.max(0, Math.min(containerHeight - cardHeight, touch.clientY - dragOffset.y))
      }
    }))
  }, [draggingCard, dragOffset, getCardDimensions])

  const handleTouchEnd = useCallback(() => {
    setDraggingCard(null)
    setDragRotation(0)
  }, [])

  // Global mouse/touch listeners
  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('touchmove', handleTouchMove)
    window.addEventListener('touchend', handleTouchEnd)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd])

  if (loading || loadingShowcases) {
    return (
      <div className="showcases-page">
        <div className="showcases-loading">Loading your showcases...</div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  if (showcases.length === 0) {
    return (
      <div className="showcases-page">
        <div className="showcases-empty">
          <h2>No Showcase Leaders Yet</h2>
          <p>Play Sealed to find rare Showcase Leaders!</p>
          <p className="showcases-hint">Showcase leaders appear in approximately 1 in 288 packs.</p>
          <Button variant="primary" className="showcases-back-button" onClick={() => router.push('/sealed')}>
            Play Sealed
          </Button>
        </div>
      </div>
    )
  }

  // Get card data including image URLs and aspect color
  const getCardData = (leader: ShowcaseLeader) => {
    const card = cardsData[leader.cardId]
    const aspectColor = card ? getAspectColor(card) : '#ffd700'
    // Card should always be found in cache since we initialize it before fetching
    // If not found, use null (will show broken image which is better than wrong URL)
    return {
      frontImage: card?.imageUrl || null,
      backImage: card?.backImageUrl || card?.imageUrl || null,
      aspectColor,
      aspects: card?.aspects || []
    }
  }

  // Count unique showcases (by name + subtitle to avoid duplicates)
  const uniqueShowcaseCount = new Set(
    showcases.map(s => `${s.cardName}|${cardsData[s.cardId]?.subtitle || ''}`)
  ).size

  // Sort showcases for export: set number ASC, villain before hero, alphabetical
  const setOrder: Record<string, number> = Object.fromEntries(
    getAllSetCodes().map((code, i) => [code, i + 1])
  )
  const sortedShowcases = [...showcases].sort((a, b) => {
    // Set number ASC
    const setA = setOrder[a.setCode] || 99
    const setB = setOrder[b.setCode] || 99
    if (setA !== setB) return setA - setB

    // Villain before hero (check aspects)
    const cardA = cardsData[a.cardId]
    const cardB = cardsData[b.cardId]
    const isVillainA = cardA?.aspects?.includes('Villainy') ? 0 : 1
    const isVillainB = cardB?.aspects?.includes('Villainy') ? 0 : 1
    if (isVillainA !== isVillainB) return isVillainA - isVillainB

    // Alphabetical
    return (a.cardName || '').localeCompare(b.cardName || '')
  })

  // Export to PNG
  const handleExport = async () => {
    setIsExporting(true)

    // Wait for render
    await new Promise(resolve => setTimeout(resolve, 100))

    try {
      const canvas = await html2canvas(exportRef.current!, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        allowTaint: true
      })

      // Show image in modal
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob)
          setImageModalUrl(url)
        }
      }, 'image/png')
    } catch (error) {
      console.error('Export failed:', error)
    } finally {
      setIsExporting(false)
    }
  }

  // Download the image from modal
  const handleDownload = () => {
    if (!imageModalUrl) return
    const link = document.createElement('a')
    link.download = 'showcase-collection.png'
    link.href = imageModalUrl
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Close modal and cleanup
  const closeImageModal = () => {
    if (imageModalUrl) {
      URL.revokeObjectURL(imageModalUrl)
    }
    setImageModalUrl(null)
  }

  return (
    <div className="showcases-page" ref={containerRef}>
      <div className="showcases-title">
        <svg className="shooting-star-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2L9 9l-7 1 5 5-1.5 7L12 18l6.5 4L17 15l5-5-7-1-3-7z" fill="currentColor" opacity="0.3"/>
          <path d="M12 2L9 9l-7 1 5 5-1.5 7L12 18l6.5 4L17 15l5-5-7-1-3-7z"/>
          <line x1="2" y1="2" x2="6" y2="6" strokeLinecap="round"/>
          <line x1="4" y1="1" x2="5" y2="3" strokeLinecap="round"/>
        </svg>
        <span className="showcases-title-text">Showcase Collection</span>
        <span className="showcases-count">{uniqueShowcaseCount}/{totalLeaders}</span>
        <button className="showcases-share-button" onClick={handleExport} title="Export as Image">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </button>
      </div>

      {showcases.map((leader) => {
        const pos = cardPositions[leader.id] || { x: 100, y: 100, rotation: 0, zIndex: 1 }
        const isFlipped = flippedCards[leader.id]
        const isDragging = draggingCard === leader.id
        const cardData = getCardData(leader)
        const currentRotation = isDragging ? pos.rotation + dragRotation : pos.rotation
        // Stagger animation by random delay (consistent per card using id as seed)
        const animationDelay = ((parseInt(leader.id, 10) * 137) % 1000) / 1000

        return (
          <div
            key={leader.id}
            className={`showcase-card ${isFlipped ? 'flipped' : ''} ${isDragging ? 'dragging' : ''}`}
            style={{
              left: pos.x,
              top: pos.y,
              zIndex: pos.zIndex,
              transform: `rotate(${currentRotation}deg)`,
              cursor: isDragging ? 'grabbing' : 'grab',
              '--aspect-color': cardData.aspectColor,
              '--animation-delay': `${animationDelay}s`
            } as React.CSSProperties}
            onMouseDown={(e) => handleMouseDown(leader.id, e)}
            onTouchStart={(e) => handleTouchStart(leader.id, e)}
            onClick={(e) => !isDragging && handleCardClick(leader.id, e)}
          >
            <div className="showcase-card-inner">
              <div className="showcase-card-front">
                <div className="showcase-card-image-container">
                  <img
                    src={cardData.frontImage || undefined}
                    alt={`${leader.cardName}${leader.cardSubtitle ? ` - ${leader.cardSubtitle}` : ''}`}
                    className="showcase-card-image"
                    draggable={false}
                  />
                  <div className="showcase-foil-effect"></div>
                </div>
              </div>
              <div className="showcase-card-back">
                <div className="showcase-card-image-container">
                  <img
                    src={cardData.backImage || undefined}
                    alt={`${leader.cardName} - Deployed`}
                    className="showcase-card-image"
                    draggable={false}
                  />
                  <div className="showcase-foil-effect"></div>
                </div>
              </div>
            </div>
          </div>
        )
      })}

      {/* Export overlay - hidden, used for PNG generation */}
      {isExporting && (
        <div className="showcases-export-container" ref={exportRef}>
          <div className="showcases-export-header">
            <svg className="shooting-star-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2L9 9l-7 1 5 5-1.5 7L12 18l6.5 4L17 15l5-5-7-1-3-7z" fill="currentColor" opacity="0.3"/>
              <path d="M12 2L9 9l-7 1 5 5-1.5 7L12 18l6.5 4L17 15l5-5-7-1-3-7z"/>
              <line x1="2" y1="2" x2="6" y2="6" strokeLinecap="round"/>
              <line x1="4" y1="1" x2="5" y2="3" strokeLinecap="round"/>
            </svg>
            <span>{user.username} Showcase Collection</span>
            <span className="showcases-count">{uniqueShowcaseCount}/{totalLeaders}</span>
          </div>
          <div className="showcases-export-url">https://www.protectthepod.com</div>
          <div className="showcases-export-grid">
            {sortedShowcases.map((leader) => {
              const cardData = getCardData(leader)
              return (
                <div key={leader.id} className="showcase-export-card">
                  <img
                    src={cardData.frontImage || undefined}
                    alt={leader.cardName}
                    className="showcase-export-image"
                    crossOrigin="anonymous"
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Image modal */}
      {imageModalUrl && (
        <div className="showcase-image-modal-overlay" onClick={closeImageModal}>
          <div className="showcase-image-modal-content" onClick={(e) => e.stopPropagation()}>
            <Button variant="icon" size="sm" className="showcase-image-modal-close" onClick={closeImageModal}>
              ×
            </Button>
            <img
              src={imageModalUrl}
              alt="Showcase Collection"
              className="showcase-image-modal-image"
            />
            <div className="showcase-image-modal-actions">
              <Button variant="primary" className="showcase-image-modal-download" onClick={handleDownload}>
                Download
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
