// @ts-nocheck
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { packOpeningLayout } from '../utils/packOpeningLayout'
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
  delay: number
  rotation: number
  revealed: boolean
  cardImageUrl: string | null
  backImageUrl: string | null
  isLeader: boolean
  packIndex: number
  isLeaderOrBase: boolean
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
  const [viewport,setViewport]=useState({width:0,height:0})
  const [mounted,setMounted]=useState(false)
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

  // Measure the actual surface, including split panes and mobile browser chrome.
  useEffect(()=>{setMounted(true)},[])
  useEffect(()=>{
    const node=containerRef.current
    if(!node)return
    const measure=()=>{const r=node.getBoundingClientRect();setViewport({width:r.width,height:r.height})}
    const observer=new ResizeObserver(measure);observer.observe(node);measure()
    return ()=>observer.disconnect()
  },[mounted])
  useEffect(()=>{
    const body=document.body.style.overflow,root=document.documentElement.style.overflow
    document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden'
    return ()=>{document.body.style.overflow=body;document.documentElement.style.overflow=root}
  },[])
  const visibleTypes=flyingCards.map(card=>({isLeader:card.isLeaderOrBase}))
  const layout=packOpeningLayout(viewport.width||1024,viewport.height||768,visibleTypes,packCount)
  const {packWidth,packHeight,gap:packGap,carousel:useCarousel}=layout
  const isMobile=viewport.width<=768

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

    const rect=containerRef.current?.getBoundingClientRect()
    const packElement=containerRef.current?.querySelector(`[data-pack-index="${packIndex}"]`)
    const packRect=packElement?.getBoundingClientRect()
    const packX=packRect&&rect?packRect.left-rect.left+packRect.width/2:viewport.width/2
    const packY=packRect&&rect?packRect.top-rect.top+packRect.height/2:layout.packsTop+packHeight/2
    const packCards=packsRef.current?.[packIndex]?.cards??[]
    const newCards=packCards.map((card,k)=>({
      id:`c-${packIndex}-${k}-${Date.now()}`,startX:packX,startY:packY,
      delay:k*40,rotation:(Math.random()-.5)*10,revealed:false,
      cardImageUrl:card.imageUrl??null,backImageUrl:card.backImageUrl??null,
      isLeader:!!card.isLeader,isLeaderOrBase:!!(card.isLeader||card.isBase),
      packIndex,isFoil:!!card.isFoil,isShowcase:!!card.isShowcase,
    }))

    setFlyingCards(newCards)

    // Reveal cards after delay
    setTimeout(() => {
      setFlyingCards(prev => prev.map(c => c.packIndex === packIndex ? { ...c, revealed: true } : c))
    }, 500)

  }, [clickedPacks, packCount, viewport, isMobile, useCarousel, layout.packsTop, packHeight])

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
    if(hoveredCard){setHoveredCard(null);setHoveredCardPosition(null);return}
    if (allPacksOpened && !isOpeningAll) {
      handleContinue()
    }
  }, [allPacksOpened, isOpeningAll, handleContinue, hoveredCard])

  const carouselIndex=openedPacks.includes(currentPackIndex)
    ? Array.from({length:packCount},(_,i)=>i).find(i=>!openedPacks.includes(i))??currentPackIndex
    : currentPackIndex
  const screenWidth=viewport.width,screenHeight=viewport.height
  const totalPacksWidth=packCount*packWidth+(packCount-1)*packGap
  const packStartX=(screenWidth-totalPacksWidth)/2
  const isDesktop=screenWidth>768
  const previewWidth=Math.min(hoveredCard?.isLeader&&hoveredCard?.backImageUrl?240:300,(screenWidth-32)/(hoveredCard?.isLeader&&hoveredCard?.backImageUrl?2:1)-6,(screenHeight-32)/1.4)
  const previewTotal=hoveredCard?.isLeader&&hoveredCard?.backImageUrl?previewWidth*2+12:previewWidth
  if(!mounted)return null
  return createPortal(
    <div
      className={`pack-opening-container phase-${phase} ${allPacksOpened ? 'click-to-continue' : ''} ${layout.compact?'controls-compact':''}`}
      style={{'--pack-width':`${packWidth}px`,'--pack-height':`${packHeight}px`,'--packs-top':`${layout.packsTop}px`} as React.CSSProperties}
      ref={containerRef}
      onClick={handleContainerClick}
    >
      {/* Skip: a plain chevron link at the right end of the bottom row, mirroring the site's back link. */}
      <Button
        variant="secondary"
        size="sm"
        textOnly
        className="skip-button"
        onClick={handleContinue}
      >
        Skip<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>
      </Button>

      {/* Buttons above pack counter: Shuffle Packs (left) + Open All (right) */}
      <div className="open-all-container" >
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
            const offset = i - carouselIndex
            const isActive = offset === 0
            const isVisible = Math.abs(offset) <= 1
            if (!isVisible) return null

            return (
              <div
                key={`${shuffleCount}-${i}`}
                data-pack-index={i}
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
                data-pack-index={i}
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
        {flyingCards.map((card,index) => (
          <div
            key={card.id}
            className={`flying-card ${card.revealed ? 'revealed' : ''} ${card.isLeaderOrBase ? 'leader-card' : ''} ${card.isFoil || card.isShowcase ? 'foil' : ''}`}
            style={{
              '--start-x': `${card.startX}px`, '--start-y': `${card.startY}px`,
              '--end-x': `${layout.positions[index]?.x}px`, '--end-y': `${layout.positions[index]?.y}px`,
              '--delay': `${card.delay}ms`, '--rotation': `${card.rotation}deg`,
              '--card-width': `${layout.positions[index]?.width}px`, '--card-height': `${layout.positions[index]?.height}px`,
            } as React.CSSProperties}
            onClick={(e)=>{
              e.stopPropagation()
              if(!card.revealed)return
              const rect=e.currentTarget.getBoundingClientRect()
              setHoveredCard(hoveredCard?.id===card.id?null:card)
              setHoveredCardPosition({x:rect.left+rect.width/2,y:rect.top})
            }}
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
      {hoveredCard && hoveredCard.cardImageUrl && hoveredCardPosition && (
        <div
          className="card-preview-overlay"
          style={{
            left: `${Math.min(Math.max(hoveredCardPosition.x, previewTotal/2+16), screenWidth-previewTotal/2-16)}px`,
            top: `${Math.max(16,Math.min(hoveredCardPosition.y-previewWidth*1.4-12,screenHeight-previewWidth*1.4-16))}px`,
            '--preview-width':`${previewWidth}px`,
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
  ,document.body)
}
