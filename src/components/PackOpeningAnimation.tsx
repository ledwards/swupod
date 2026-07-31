// @ts-nocheck
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Button from './Button'
import './PackOpeningAnimation.css'


interface Card {
  imageUrl?: string
  isLeader?: boolean
  isFoil?: boolean
  isShowcase?: boolean
  [key: string]: unknown
}

interface Pack {
  cards: Card[]
  [key: string]: unknown
}

interface FlyingCard {
  id: string
  startX: number
  startY: number
  endX: number
  endY: number
  delay: number
  rotation: number
  revealed: boolean
  cardImageUrl: string | null
  backImageUrl: string | null
  isLeader: boolean
  packIndex: number
  isLeaderOrBase: boolean
  width: number
  height: number
  isFoil: boolean
  isShowcase: boolean
}

interface HoveredCardPosition {
  x: number
  y: number
}

interface PackOpeningAnimationProps {
  packCount?: number
  packImageUrl?: string
  packImageUrls?: string[] // Array of pack images for multi-set pools (chaos sealed)
  cardBackUrl?: string
  onComplete?: () => void
  packs?: Pack[] | null
  onRandomize?: () => Promise<void>
  isRandomizing?: boolean
  hasBox?: boolean
  setCode?: string // Set code to check for prerelease status
}

export default function PackOpeningAnimation({
  packCount = 6,
  packImageUrl = '/pack-images/default-pack.png',
  packImageUrls,
  cardBackUrl = '/card-images/card-back.png',
  onComplete,
  packs = null,
  onRandomize,
  isRandomizing = false,
  hasBox = false,
  setCode,
}: PackOpeningAnimationProps) {
  // Get pack image for a specific pack index
  const getPackImage = (index: number) => {
    if (packImageUrls && packImageUrls[index]) {
      return packImageUrls[index]
    }
    return packImageUrl
  }
  const [openedPacks, setOpenedPacks] = useState<number[]>([])
  const [flyingCards, setFlyingCards] = useState<FlyingCard[]>([])
  const [phase, setPhase] = useState('entering')
  const [hoveredCard, setHoveredCard] = useState<FlyingCard | null>(null)
  const [hoveredCardPosition, setHoveredCardPosition] = useState<HoveredCardPosition | null>(null)
  const [isOpeningAll, setIsOpeningAll] = useState(false)
  const [allPacksOpened, setAllPacksOpened] = useState(false)
  const [clickedPacks, setClickedPacks] = useState<number[]>([])
  const [isMobile, setIsMobile] = useState(false)
  const [useCarousel, setUseCarousel] = useState(false)
  const [currentPackIndex, setCurrentPackIndex] = useState(0)
  const [shufflePhase, setShufflePhase] = useState<'idle' | 'exiting' | 'entering' | 'entered'>('idle')
  const [shuffleCount, setShuffleCount] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationCompleteRef = useRef(false)
  const packsRef = useRef(packs)
  const openAllIndexRef = useRef(0)

  // Handle randomize with animation
  const handleRandomizeWithAnimation = useCallback(async () => {
    if (!onRandomize || (shufflePhase !== 'idle' && shufflePhase !== 'entered')) return

    // Phase 1: Exit animation
    setShufflePhase('exiting')

    // Play shuffling sound after exit animation completes
    await new Promise(resolve => setTimeout(resolve, 700))

    if (typeof window !== 'undefined') {
      const sound = new Audio('/sounds/shuffling-hand.mp3')
      sound.volume = 0.5
      sound.play().catch(() => {})
    }

    // Wait for rest of exit animation
    await new Promise(resolve => setTimeout(resolve, 250))

    // Call the actual randomize (updates packs in parent)
    await onRandomize()

    // Wait while "shuffling"
    await new Promise(resolve => setTimeout(resolve, 750))

    // Increment shuffle count to force React to re-create pack elements
    setShuffleCount(c => c + 1)

    // Phase 2: Enter animation
    setShufflePhase('entering')

    // Wait for enter animation to complete (~0.8s with stagger)
    await new Promise(resolve => setTimeout(resolve, 800))

    // Done - use 'entered' to keep shuffle-enter class (prevents pack-enter animation)
    setShufflePhase('entered')
  }, [onRandomize, shufflePhase])

  // Keep packs ref updated
  useEffect(() => {
    packsRef.current = packs
  }, [packs])

  // Detect mobile and carousel mode (when packs overflow screen width)
  useEffect(() => {
    const checkLayout = () => {
      const mobile = window.innerWidth <= 768
      setIsMobile(mobile)
      if (mobile) {
        setUseCarousel(true)
      } else {
        // Desktop: use carousel if packs don't fit with padding
        const totalWidth = packCount * packWidth + (packCount - 1) * packGap
        setUseCarousel(totalWidth > window.innerWidth - 100)
      }
    }
    checkLayout()
    window.addEventListener('resize', checkLayout)
    return () => window.removeEventListener('resize', checkLayout)
  }, [packCount])

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
      document.documentElement.style.overflow = ''
      window.scrollTo(0, 0)
    }
  }, [])

  // Calculate layout values - card sizes match DeckBuilder
  const getLayoutValues = useCallback(() => {
    const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 1080
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1920
    const mobile = screenWidth <= 768

    // Mobile: smaller cards to fit 5 per row with gaps
    // Desktop: original sizes
    const cardWidth = mobile ? Math.floor((screenWidth - 48) / 5) : 120
    const cardHeight = cardWidth * (3.5 / 2.5) // aspect ratio 2.5 / 3.5
    // Leaders/bases: width = height of regular cards, displayed landscape
    const leaderWidth = mobile ? Math.floor((screenWidth - 24) / 2.5) : cardHeight
    const leaderHeight = mobile ? leaderWidth * (2.5 / 3.5) : cardWidth
    const cardGap = mobile ? 6 : 10

    return { screenHeight, screenWidth, cardHeight, cardWidth, leaderWidth, leaderHeight, cardGap, mobile }
  }, [])

  // Show packs on mount
  useEffect(() => {
    setPhase('entering')
    setOpenedPacks([])
    setClickedPacks([])
    setFlyingCards([])
    setAllPacksOpened(false)

    const timer = setTimeout(() => setPhase('presenting'), 300)
    return () => clearTimeout(timer)
  }, [])

  // Layout values for packs (one row) - same size as cards
  const packWidth = 120
  const packHeight = packWidth * (3.5 / 2.5) // same aspect ratio as cards
  const packGap = 10

  // Open a specific pack
  const openPack = useCallback((packIndex: number) => {
    if (clickedPacks.includes(packIndex)) return

    // Track clicked pack immediately
    setClickedPacks(prev => [...prev, packIndex])

    // Hide pack after delay (faster on mobile) and advance carousel
    setTimeout(() => {
      setOpenedPacks(prev => [...prev, packIndex])
      // In carousel mode, advance to next pack
      if (useCarousel && packIndex < packCount - 1) {
        setCurrentPackIndex(packIndex + 1)
      }
    }, isMobile ? 600 : 1000)

    // Check if this is the last pack
    if (clickedPacks.length + 1 === packCount) {
      setTimeout(() => {
        setAllPacksOpened(true)
        setPhase('ready')
      }, 600)
    }

    // Play card mixing sound at 4x speed
    if (typeof window !== 'undefined') {
      const sound = new Audio('/sounds/card-mixing.mp3')
      sound.volume = 0.5
      sound.preservesPitch = false
      sound.playbackRate = 4.0
      // Ensure playbackRate is set before playing
      sound.addEventListener('canplaythrough', () => {
        sound.playbackRate = 4.0
        sound.play().catch(() => {})
      }, { once: true })
      sound.load()
    }

    // Clear existing cards
    setFlyingCards([])

    const { screenWidth, screenHeight, cardHeight, cardWidth, leaderWidth, leaderHeight, cardGap, mobile } = getLayoutValues()

    // Calculate the position of the pack being opened
    let packX: number, packY: number
    if (useCarousel) {
      // Carousel mode (mobile or overflow): pack is centered
      packX = screenWidth / 2
      packY = mobile ? screenHeight * 0.82 : screenHeight - 160 - packHeight / 2
    } else {
      // Desktop row: packs in a single row
      const totalPacksWidth = packCount * packWidth + (packCount - 1) * packGap
      const packStartXCalc = (screenWidth - totalPacksWidth) / 2
      const packsY = screenHeight - 354
      packX = packStartXCalc + packIndex * (packWidth + packGap) + packWidth / 2
      packY = packsY + packHeight / 2
    }

    // Cards layout
    const currentPacks = packsRef.current
    const packCards = currentPacks?.[packIndex]?.cards || []
    const cardCount = Math.min(packCards.length || 16, 16)

    const newCards: FlyingCard[] = []

    if (mobile) {
      // MOBILE LAYOUT: 4 rows, all positions as % of screenHeight
      // Row 1: 2 leaders/bases (landscape)
      // Row 2: 5 cards
      // Row 3: 5 cards
      // Row 4: 4 cards
      const rowGap = screenHeight * 0.01
      const cardsStartY = screenHeight * 0.04

      // Scale cards down if they don't fit in the cards zone (~55% of screen)
      const cardsZoneHeight = screenHeight * 0.55
      // 4 rows: 1 leader row + 3 card rows, with 3 gaps between them
      const availableForCards = cardsZoneHeight - leaderHeight - 3 * rowGap
      const maxCardHeight = availableForCards / 3
      let mobileCardWidth = cardWidth
      let mobileCardHeight = cardHeight
      let mobileLeaderWidth = leaderWidth
      let mobileLeaderHeight = leaderHeight
      if (cardHeight > maxCardHeight) {
        const scale = maxCardHeight / cardHeight
        mobileCardWidth = Math.floor(cardWidth * scale)
        mobileCardHeight = Math.floor(cardHeight * scale)
        mobileLeaderWidth = Math.floor(leaderWidth * scale)
        mobileLeaderHeight = Math.floor(leaderHeight * scale)
      }

      // Row 1: First 2 cards (may be leaders/bases or regular cards)
      const row1Cards = packCards.slice(0, 2)
      const mobileLeaderCount = row1Cards.filter(c => c?.isLeader || c?.isBase).length
      const mobileRegularCount = 2 - mobileLeaderCount
      const row1Width = mobileLeaderCount * mobileLeaderWidth + mobileRegularCount * mobileCardWidth + cardGap
      const row1StartX = (screenWidth - row1Width) / 2
      const row1Y = cardsStartY + mobileLeaderHeight / 2

      // Rows 2-4: Regular cards (5, 5, 4)
      const row2CardsPerRow = 5
      const row3CardsPerRow = 5
      const row4CardsPerRow = 4
      const regularRowWidth = row2CardsPerRow * mobileCardWidth + (row2CardsPerRow - 1) * cardGap
      const row2StartX = (screenWidth - regularRowWidth) / 2
      const row3StartX = (screenWidth - regularRowWidth) / 2
      const row4Width = row4CardsPerRow * mobileCardWidth + (row4CardsPerRow - 1) * cardGap
      const row4StartX = (screenWidth - row4Width) / 2

      const row2Y = row1Y + mobileLeaderHeight / 2 + rowGap + mobileCardHeight / 2
      const row3Y = row2Y + mobileCardHeight + rowGap
      const row4Y = row3Y + mobileCardHeight + rowGap

      for (let k = 0; k < cardCount; k++) {
        const card = packCards[k]
        const isLeaderOrBase = !!(card?.isLeader || card?.isBase)
        const w = isLeaderOrBase ? mobileLeaderWidth : mobileCardWidth
        const h = isLeaderOrBase ? mobileLeaderHeight : mobileCardHeight

        let endX: number, endY: number
        if (k < 2) {
          // Row 1: First 2 cards — position accounts for mixed widths
          let xOffset = 0
          for (let j = 0; j < k; j++) {
            const jCard = packCards[j]
            xOffset += ((jCard?.isLeader || jCard?.isBase) ? mobileLeaderWidth : mobileCardWidth) + cardGap
          }
          endX = row1StartX + xOffset + w / 2
          endY = row1Y
        } else if (k < 7) {
          // Row 2: indices 2-6 (5 cards)
          const col = k - 2
          endX = row2StartX + col * (mobileCardWidth + cardGap) + mobileCardWidth / 2
          endY = row2Y
        } else if (k < 12) {
          // Row 3: indices 7-11 (5 cards)
          const col = k - 7
          endX = row3StartX + col * (mobileCardWidth + cardGap) + mobileCardWidth / 2
          endY = row3Y
        } else {
          // Row 4: indices 12-15 (4 cards)
          const col = k - 12
          endX = row4StartX + col * (mobileCardWidth + cardGap) + mobileCardWidth / 2
          endY = row4Y
        }

        newCards.push({
          id: `c-${packIndex}-${k}-${Date.now()}-${Math.random()}`,
          startX: packX, startY: packY,
          endX, endY,
          delay: k * 40,
          rotation: (Math.random() - 0.5) * 10,
          revealed: false,
          cardImageUrl: card?.imageUrl || null,
          backImageUrl: card?.backImageUrl || null,
          isLeader: card?.isLeader || false,
          packIndex,
          isLeaderOrBase,
          width: w, height: h,
          isFoil: card?.isFoil || false,
          isShowcase: card?.isShowcase || false,
        })
      }
    } else {
      // DESKTOP LAYOUT: 2 rows of 8
      const cardsStartY = 120
      const rowGap = 15
      const cardsPerRow = 8

      // Row 1: count actual leaders/bases in first row
      const row1Cards = packCards.slice(0, cardsPerRow)
      const row1LeaderCount = row1Cards.filter(c => c?.isLeader || c?.isBase).length
      const row1RegularCount = cardsPerRow - row1LeaderCount
      const row1Width = row1LeaderCount * leaderWidth + row1RegularCount * cardWidth + (cardsPerRow - 1) * cardGap
      const row2Width = cardsPerRow * cardWidth + (cardsPerRow - 1) * cardGap

      const row1StartX = (screenWidth - row1Width) / 2
      const row2StartX = (screenWidth - row2Width) / 2

      const row1Y = cardsStartY + leaderHeight / 2
      const row2Y = row1Y + leaderHeight / 2 + rowGap + cardHeight / 2

      for (let k = 0; k < cardCount; k++) {
        const row = Math.floor(k / cardsPerRow)
        const col = k % cardsPerRow
        const card = packCards[k]
        const isLeaderOrBase = !!(card?.isLeader || card?.isBase)
        const w = isLeaderOrBase ? leaderWidth : cardWidth
        const h = isLeaderOrBase ? leaderHeight : cardHeight

        let endX: number, endY: number
        if (row === 0) {
          // First row - account for mixed widths based on actual card type
          let xOffset = 0
          for (let j = 0; j < col; j++) {
            const jCard = packCards[j]
            xOffset += ((jCard?.isLeader || jCard?.isBase) ? leaderWidth : cardWidth) + cardGap
          }
          endX = row1StartX + xOffset + w / 2
          endY = row1Y
        } else {
          // Second row - all same width
          endX = row2StartX + col * (cardWidth + cardGap) + cardWidth / 2
          endY = row2Y
        }

        newCards.push({
          id: `c-${packIndex}-${k}-${Date.now()}-${Math.random()}`,
          startX: packX, startY: packY,
          endX, endY,
          delay: k * 40,
          rotation: (Math.random() - 0.5) * 10,
          revealed: false,
          cardImageUrl: card?.imageUrl || null,
          backImageUrl: card?.backImageUrl || null,
          isLeader: card?.isLeader || false,
          packIndex,
          isLeaderOrBase,
          width: w, height: h,
          isFoil: card?.isFoil || false,
          isShowcase: card?.isShowcase || false,
        })
      }
    }

    setFlyingCards(newCards)

    // Reveal cards after delay
    setTimeout(() => {
      setFlyingCards(prev => prev.map(c => c.packIndex === packIndex ? { ...c, revealed: true } : c))
    }, 500)

  }, [clickedPacks, packCount, getLayoutValues, isMobile, useCarousel])

  // Open all packs sequentially
  const openAllPacks = useCallback(() => {
    if (isOpeningAll) return
    setIsOpeningAll(true)
    openAllIndexRef.current = 0

    const openNext = () => {
      const idx = openAllIndexRef.current
      if (idx >= packCount) {
        // All done, proceed to next page
        setTimeout(() => {
          animationCompleteRef.current = true
          setPhase('complete')
          setTimeout(() => onComplete?.(), 400)
        }, 800)
        return
      }

      // In carousel mode, set current pack index before opening
      if (useCarousel) {
        setCurrentPackIndex(idx)
      }
      openPack(idx)
      openAllIndexRef.current++
      // Slightly faster on mobile since less visual complexity
      setTimeout(openNext, isMobile ? 1800 : 2200)
    }

    openNext()
  }, [isOpeningAll, packCount, openPack, onComplete, isMobile])

  // Click handler - click on pack to open it
  const handlePackClick = useCallback((e: React.MouseEvent, packIndex: number) => {
    e.stopPropagation()
    if (isOpeningAll) return
    openPack(packIndex)
  }, [openPack, isOpeningAll])

  // Handle continue/skip click
  const handleContinue = useCallback(() => {
    if (animationCompleteRef.current) return
    animationCompleteRef.current = true
    setPhase('complete')
    setTimeout(() => onComplete?.(), 400)
  }, [onComplete])

  // Handle click anywhere to continue (only after all packs opened)
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // Don't trigger if clicking on a pack or button
    if ((e.target as HTMLElement).closest('.pack-item') || (e.target as HTMLElement).closest('button')) return
    if (allPacksOpened && !isOpeningAll) {
      handleContinue()
    }
  }, [allPacksOpened, isOpeningAll, handleContinue])

  // Layout for packs and cards - vertically centered
  const { screenWidth, screenHeight, cardHeight, cardWidth, leaderHeight, mobile } = getLayoutValues()
  const totalPacksWidth = packCount * packWidth + (packCount - 1) * packGap
  const packStartX = (screenWidth - totalPacksWidth) / 2

  // Mobile carousel layout
  const mobilePackWidth = 80
  const mobilePackHeight = mobilePackWidth * (3.5 / 2.5)
  const mobilePackGap = 12

  // Simple fixed layout
  const cardsStartY = mobile ? 20 : 120  // Cards land closer to top on mobile

  // Check if device is desktop (for hover preview)
  const isDesktop = typeof window !== 'undefined' && window.innerWidth > 768

  return (
    <div
      className={`pack-opening-container phase-${phase} ${allPacksOpened ? 'click-to-continue' : ''}`}
      ref={containerRef}
      onClick={handleContainerClick}
    >
      {/* Skip button in upper right */}
      <Button
        variant="secondary"
        size="sm"
        className="skip-button"
        onClick={handleContinue}
      >
        Skip →
      </Button>

      {/* Buttons above pack counter: Shuffle Packs (left) + Open All (right) */}
      <div className="open-all-container" style={{ bottom: '110px' }}>
        {hasBox && clickedPacks.length === 0 && !isOpeningAll && (
          <Button
            variant="secondary"
            glowColor="blue"
            className="randomize-button"
            onClick={handleRandomizeWithAnimation}
            disabled={isRandomizing || (shufflePhase !== 'idle' && shufflePhase !== 'entered')}
            title={`Shuffle which ${packCount} packs you get from a 24-pack booster box`}
          >
            {shufflePhase === 'exiting' || shufflePhase === 'entering' ? 'Shuffling...' : 'Shuffle Packs'}
          </Button>
        )}
        <Button
          variant={allPacksOpened ? 'primary' : 'secondary'}
          className={allPacksOpened ? 'continue-button' : 'open-all-button'}
          onClick={allPacksOpened ? handleContinue : openAllPacks}
        >
          {allPacksOpened ? 'Continue' : 'Open All'}
        </Button>
      </div>

      {/* Packs - carousel when mobile or too many packs, row otherwise */}
      {useCarousel ? (
        <div className={`packs-carousel ${!isMobile ? 'desktop' : ''}`}>
          {Array.from({ length: packCount }).map((_, i) => {
            const isOpened = openedPacks.includes(i)
            if (isOpened) return null
            // Position relative to current pack
            const offset = i - currentPackIndex
            const isActive = offset === 0
            const isVisible = Math.abs(offset) <= 2
            if (!isVisible) return null

            return (
              <div
                key={`${shuffleCount}-${i}`}
                className={`pack-item-mobile ${isActive ? 'active' : ''} ${clickedPacks.includes(i) ? 'fading' : ''} ${shufflePhase === 'exiting' ? 'shuffle-exit' : ''} ${shufflePhase === 'entering' || shufflePhase === 'entered' ? 'shuffle-enter' : ''}`}
                style={{
                  '--offset': offset,
                  '--abs-offset': Math.abs(offset),
                  '--pack-delay': `${i * 80}ms`,
                  '--shuffle-delay': `${i * 60}ms`,
                } as React.CSSProperties}
                onClick={(e) => isActive && handlePackClick(e, i)}
              >
                <div className="pack-wrapper-mobile">
                  <div className="pack-image-container">
                    <img src={getPackImage(i)} alt={`Pack ${i + 1}`} className="pack-image"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement?.classList.add('pack-fallback') }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className={`packs-row ${shufflePhase !== 'idle' ? 'shuffling' : ''}`}>
          {Array.from({ length: packCount }).map((_, i) => {
            const isOpened = openedPacks.includes(i)
            if (isOpened) return null // Don't render opened packs
            const x = packStartX + i * (packWidth + packGap)
            return (
              <div
                key={`${shuffleCount}-${i}`}
                className={`pack-item visible ${clickedPacks.includes(i) ? 'fading' : ''} ${shufflePhase === 'exiting' ? 'shuffle-exit' : ''} ${shufflePhase === 'entering' || shufflePhase === 'entered' ? 'shuffle-enter' : ''}`}
                style={{ '--pack-x': `${x}px`, '--pack-delay': `${i * 80}ms`, '--shuffle-delay': `${i * 60}ms` } as React.CSSProperties}
                onClick={(e) => handlePackClick(e, i)}
              >
                <div className="pack-wrapper">
                  <div className="pack-image-container">
                    <img src={getPackImage(i)} alt={`Pack ${i + 1}`} className="pack-image"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement?.classList.add('pack-fallback') }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Flying cards */}
      <div className="flying-cards-container">
        {flyingCards.map((card) => (
          <div
            key={card.id}
            className={`flying-card ${card.revealed ? 'revealed' : ''} ${card.isLeaderOrBase ? 'leader-card' : ''} ${card.isFoil || card.isShowcase ? 'foil' : ''}`}
            style={{
              '--start-x': `${card.startX}px`, '--start-y': `${card.startY}px`,
              '--end-x': `${card.endX}px`, '--end-y': `${card.endY}px`,
              '--delay': `${card.delay}ms`, '--rotation': `${card.rotation}deg`,
              '--card-width': `${card.width}px`, '--card-height': `${card.height}px`,
            } as React.CSSProperties}
            onMouseEnter={(e) => {
              if (isDesktop && card.revealed) {
                const rect = e.currentTarget.getBoundingClientRect()
                setHoveredCard(card)
                setHoveredCardPosition({ x: rect.left + rect.width / 2, y: rect.top })
              }
            }}
            onMouseLeave={() => {
              setHoveredCard(null)
              setHoveredCardPosition(null)
            }}
          >
            <div className="card-inner">
              <div className="card-back">
                <img src={cardBackUrl} alt="Card Back"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement?.classList.add('card-back-fallback') }}
                />
              </div>
              <div className={`card-front ${card.isFoil || card.isShowcase ? 'foil-content' : ''}`}>
                {card.cardImageUrl ? (
                  <img src={card.cardImageUrl} alt="Card"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement?.classList.add('card-front-fallback') }}
                  />
                ) : <div className="card-front-fallback"></div>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Card hover preview (desktop only) */}
      {isDesktop && hoveredCard && hoveredCard.cardImageUrl && hoveredCardPosition && (
        <div
          className="card-preview-overlay"
          style={{
            left: `${Math.min(Math.max(hoveredCardPosition.x, 180), screenWidth - 180)}px`,
            top: `${Math.max(hoveredCardPosition.y - 320, 20)}px`,
          }}
        >
          {hoveredCard.isLeader && hoveredCard.backImageUrl ? (
            // Leader with back - show both sides
            <div className="card-preview-leader">
              <div className={`card-preview card-preview-front ${hoveredCard.isFoil || hoveredCard.isShowcase ? 'card-preview-foil' : ''}`}>
                <img src={hoveredCard.cardImageUrl} alt="Card Front" />
              </div>
              <div className={`card-preview card-preview-back ${hoveredCard.isFoil || hoveredCard.isShowcase ? 'card-preview-foil' : ''}`}>
                <img src={hoveredCard.backImageUrl} alt="Card Back" />
              </div>
            </div>
          ) : (
            // Regular card or leader without back
            <div className={`card-preview ${hoveredCard.isFoil || hoveredCard.isShowcase ? 'card-preview-foil' : ''}`}>
              <img src={hoveredCard.cardImageUrl} alt="Card Preview" />
            </div>
          )}
        </div>
      )}

      {/* Pack counter at bottom - hide once all packs opened */}
      {!allPacksOpened && (
        <div className="pack-counter">
          Pack {openedPacks.length > 0 ? openedPacks.length : 1}/{packCount}
        </div>
      )}

    </div>
  )
}
