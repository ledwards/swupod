// @ts-nocheck
/**
 * useDragAndDrop Hook
 *
 * Handles card drag and drop, selection, and overlap cleanup in the deck builder.
 */

import { useState, useCallback, useRef, useEffect, RefObject, Dispatch, SetStateAction } from 'react'

// === TYPES ===

/** Card with drag-relevant properties */
interface DragCard {
  isLeader?: boolean;
  isBase?: boolean;
  [key: string]: unknown;
}

/** Card position in deck builder */
interface CardPosition {
  x: number;
  y: number;
  section: string;
  visible: boolean;
  enabled?: boolean;
  zIndex?: number;
  card: DragCard;
}

/** Card positions map */
type CardPositionsMap = Record<string, CardPosition>;

/** Section bounds */
interface SectionBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Selection box state */
interface SelectionBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

/** Props for useDragAndDrop hook */
interface UseDragAndDropProps {
  cardPositions: CardPositionsMap;
  setCardPositions: Dispatch<SetStateAction<CardPositionsMap>>;
  sectionBounds: Record<string, SectionBounds>;
  activeLeader: string | null;
  setActiveLeader: Dispatch<SetStateAction<string | null>>;
  activeBase: string | null;
  setActiveBase: Dispatch<SetStateAction<string | null>>;
  poolSortOption: string;
  deckSortOption: string;
  setShowAspectPenalties: Dispatch<SetStateAction<boolean>>;
  setHoveredCard: Dispatch<SetStateAction<DragCard | null>>;
  canvasRef: RefObject<HTMLDivElement | null>;
}

/** Return type for useDragAndDrop hook */
export interface UseDragAndDropReturn {
  draggedCard: string | null;
  selectedCards: Set<string>;
  setSelectedCards: Dispatch<SetStateAction<Set<string>>>;
  selectionBox: SelectionBox | null;
  isSelecting: boolean;
  handleMouseDown: (e: React.MouseEvent, cardId: string) => void;
  handleCanvasMouseDown: (e: React.MouseEvent) => void;
}

// === HELPERS ===

// Find cards that are touching a given card
function findTouchingCards(cardId: string, positions: CardPositionsMap): Set<string> {
  const card = positions[cardId]
  if (!card) return new Set()

  const touching = new Set([cardId])
  const cardWidth = card.card.isLeader || card.card.isBase ? 168 : 120
  const cardHeight = card.card.isLeader || card.card.isBase ? 120 : 168
  const threshold = 5

  const cardLeft = card.x
  const cardRight = card.x + cardWidth
  const cardTop = card.y
  const cardBottom = card.y + cardHeight

  Object.entries(positions).forEach(([otherId, otherPos]) => {
    if (otherId === cardId || !otherPos.visible) return
    if (otherPos.section !== card.section) return

    const otherWidth = otherPos.card.isLeader || otherPos.card.isBase ? 168 : 120
    const otherHeight = otherPos.card.isLeader || otherPos.card.isBase ? 120 : 168

    const otherLeft = otherPos.x
    const otherRight = otherPos.x + otherWidth
    const otherTop = otherPos.y
    const otherBottom = otherPos.y + otherHeight

    const horizontalOverlap = !(cardRight < otherLeft - threshold || cardLeft > otherRight + threshold)
    const verticalOverlap = !(cardBottom < otherTop - threshold || cardTop > otherBottom + threshold)

    if (horizontalOverlap && verticalOverlap) {
      touching.add(otherId)
    }
  })

  return touching
}

// === HOOK ===

export function useDragAndDrop({
  cardPositions,
  setCardPositions,
  sectionBounds,
  activeLeader,
  setActiveLeader,
  activeBase,
  setActiveBase,
  poolSortOption,
  deckSortOption,
  setShowAspectPenalties,
  setHoveredCard,
  canvasRef,
}: UseDragAndDropProps): UseDragAndDropReturn {
  // Drag state
  const [draggedCard, setDraggedCard] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set())
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const [isShiftDrag, setIsShiftDrag] = useState(false)
  const [touchingCards, setTouchingCards] = useState<Set<string>>(new Set())
  // _zIndexCounter is only used via setZIndexCounter callback to generate unique z-indices
  const [_zIndexCounter, setZIndexCounter] = useState(1000)

  // Refs
  const hasDraggedRef = useRef(false)
  const finalDragPositionRef = useRef<{ x: number; y: number } | null>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent, cardId: string) => {
    if (e.button !== 0) return // Only left click
    e.preventDefault()
    e.stopPropagation()

    if (!cardId) return
    const card = cardPositions[cardId]
    if (!card) return

    // Reset drag flag at start of mouse down
    hasDraggedRef.current = false

    // Handle leaders and bases - they can't be dragged, only selected
    if (card.section === 'leaders-bases' && card.card.isLeader) {
      const newLeader = cardId === activeLeader ? null : cardId
      setActiveLeader(newLeader)
      if (newLeader && (poolSortOption === 'cost' || deckSortOption === 'cost')) {
        setShowAspectPenalties(true)
      }
      return
    }

    if (card.section === 'leaders-bases' && card.card.isBase) {
      setActiveBase(cardId === activeBase ? null : cardId)
      return
    }

    // For other cards, allow normal dragging and selection
    const isModifierPressed = e.metaKey || e.ctrlKey
    if (isModifierPressed) {
      // Multi-select (only within same section)
      setZIndexCounter(prev => {
        const newZ = prev + 1
        setCardPositions(prevPos => {
          const existing = prevPos[cardId]
          if (!existing) return prevPos
          return {
            ...prevPos,
            [cardId]: { ...existing, zIndex: newZ }
          }
        })
        return newZ
      })

      setSelectedCards(prev => {
        const newSet = new Set(prev)
        if (prev.size > 0) {
          const firstCardId = Array.from(prev)[0]
          const firstCard = firstCardId ? cardPositions[firstCardId] : undefined
          if (firstCard && firstCard.section !== card.section) {
            newSet.clear()
          }
        }

        if (newSet.has(cardId)) {
          newSet.delete(cardId)
        } else {
          newSet.add(cardId)
        }
        return newSet
      })
      return
    }

    // Bring to front
    setZIndexCounter(prev => {
      const newZ = prev + 1
      setCardPositions(prevPos => {
        const existing = prevPos[cardId]
        if (!existing) return prevPos
        return {
          ...prevPos,
          [cardId]: { ...existing, zIndex: newZ }
        }
      })
      return newZ
    })

    const canvasElement = canvasRef.current
    if (!canvasElement) return

    const rect = canvasElement.getBoundingClientRect()
    const offsetX = (e.clientX - rect.left) - card.x
    const offsetY = (e.clientY - rect.top) - card.y

    // Check if shift is pressed for group drag
    const isShiftPressed = e.shiftKey
    setIsShiftDrag(isShiftPressed)

    if (isShiftPressed) {
      const touching = findTouchingCards(cardId, cardPositions)
      setTouchingCards(touching)
      setSelectedCards(touching)
    } else {
      setTouchingCards(new Set())
      if (!isModifierPressed && !selectedCards.has(cardId)) {
        setSelectedCards(new Set([cardId]))
      }
    }

    setDraggedCard(cardId)
    setDragOffset({ x: offsetX, y: offsetY })
    hasDraggedRef.current = false
  }, [cardPositions, activeLeader, activeBase, poolSortOption, deckSortOption, selectedCards, setActiveLeader, setActiveBase, setShowAspectPenalties, setCardPositions, canvasRef])

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    const canvasElement = canvasRef.current
    if (!canvasElement) return

    if (target === canvasElement || target.classList.contains('deck-canvas')) {
      const rect = canvasElement.getBoundingClientRect()
      const startX = (e.clientX - rect.left)
      const startY = (e.clientY - rect.top)
      setIsSelecting(true)
      setSelectionBox({ startX, startY, endX: startX, endY: startY })
      setSelectedCards(new Set())
    }
  }, [canvasRef])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isSelecting && selectionBox) {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return

      const endX = (e.clientX - rect.left)
      const endY = (e.clientY - rect.top)
      setSelectionBox(prev => prev ? { ...prev, endX, endY } : null)

      // Select cards in box
      const minX = Math.min(selectionBox.startX, endX)
      const maxX = Math.max(selectionBox.startX, endX)
      const minY = Math.min(selectionBox.startY, endY)
      const maxY = Math.max(selectionBox.startY, endY)

      const newSelected = new Set<string>()
      Object.entries(cardPositions).forEach(([cardId, pos]) => {
        if (!pos.visible) return
        const cardWidth = pos.card.isLeader || pos.card.isBase ? 168 : 120
        const cardHeight = pos.card.isLeader || pos.card.isBase ? 120 : 168
        const cardRight = pos.x + cardWidth
        const cardBottom = pos.y + cardHeight

        if (pos.x < maxX && cardRight > minX && pos.y < maxY && cardBottom > minY) {
          newSelected.add(cardId)
        }
      })

      // Only select cards from the same section if multiple are selected
      if (newSelected.size > 1) {
        const sections = new Set(Array.from(newSelected).map(id => cardPositions[id]?.section))
        if (sections.size > 1) {
          const firstId = Array.from(newSelected)[0]
          const firstSection = firstId ? cardPositions[firstId]?.section : null
          const filtered = new Set<string>()
          newSelected.forEach(id => {
            if (cardPositions[id]?.section === firstSection) {
              filtered.add(id)
            }
          })
          setSelectedCards(filtered)
          return
        }
      }
      setSelectedCards(newSelected)
    } else if (draggedCard) {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return

      hasDraggedRef.current = true
      setCardPositions(prev => {
        const currentCard = prev[draggedCard]
        if (!currentCard) return prev

        const newX = (e.clientX - rect.left) - dragOffset.x
        const newY = (e.clientY - rect.top) - dragOffset.y
        const cardWidth = currentCard.card.isLeader || currentCard.card.isBase ? 168 : 120
        const cardHeight = currentCard.card.isLeader || currentCard.card.isBase ? 120 : 168

        const section = currentCard.section
        const bounds = sectionBounds[section]
        if (!bounds) return prev

        // Constrain to section boundaries
        const minX = bounds.minX
        const maxX = bounds.maxX - cardWidth
        const minY = bounds.minY
        const maxY = bounds.maxY - cardHeight

        const constrainedX = Math.max(minX, Math.min(newX, maxX))
        const constrainedY = Math.max(minY, Math.min(newY, maxY))

        const updates = { ...prev }

        // Determine which cards to move
        let cardsToMove = new Set([draggedCard])
        if (isShiftDrag && touchingCards.size > 0) {
          cardsToMove = touchingCards
        } else if (selectedCards.has(draggedCard) && selectedCards.size > 1) {
          cardsToMove = selectedCards
        }

        // Move all cards together (only if they're in the same section)
        if (cardsToMove.size > 1) {
          const deltaX = constrainedX - currentCard.x
          const deltaY = constrainedY - currentCard.y

          cardsToMove.forEach(id => {
            const cardPos = updates[id]
            if (cardPos && cardPos.section === section) {
              const cardW = cardPos.card.isLeader || cardPos.card.isBase ? 168 : 120
              const cardH = cardPos.card.isLeader || cardPos.card.isBase ? 120 : 168
              const newCardX = Math.max(minX, Math.min(cardPos.x + deltaX, bounds.maxX - cardW))
              const newCardY = Math.max(minY, Math.min(cardPos.y + deltaY, bounds.maxY - cardH))
              updates[id] = {
                ...cardPos,
                x: newCardX,
                y: newCardY
              }
            }
          })
        } else {
          updates[draggedCard] = {
            ...currentCard,
            x: constrainedX,
            y: constrainedY
          }
          finalDragPositionRef.current = { x: constrainedX, y: constrainedY }
        }

        return updates
      })
    }
  }, [draggedCard, dragOffset, selectedCards, cardPositions, isSelecting, selectionBox, sectionBounds, isShiftDrag, touchingCards, setCardPositions, canvasRef])

  const handleMouseUp = useCallback(() => {
    if (isSelecting) {
      setIsSelecting(false)
      setSelectionBox(null)
    }

    // Handle click-toggle for deck/sideboard cards if no drag occurred
    if (draggedCard && !hasDraggedRef.current) {
      const card = cardPositions[draggedCard]
      if (card && (card.section === 'deck' || card.section === 'sideboard')) {
        setHoveredCard(null)
        setCardPositions(prev => {
          const prevCard = prev[draggedCard]
          if (!prevCard) return prev
          return {
            ...prev,
            [draggedCard]: {
              ...prevCard,
              section: prevCard.section === 'deck' ? 'sideboard' : 'deck',
              enabled: prevCard.section === 'deck' ? false : true
            }
          }
        })
        setDraggedCard(null)
        setDragOffset({ x: 0, y: 0 })
        return
      }
    }

    if (draggedCard) {
      const currentDraggedCard = draggedCard
      const finalPos = finalDragPositionRef.current

      // Cleanup overlap
      setCardPositions(prev => {
        const draggedCardPos = prev[currentDraggedCard]
        if (!draggedCardPos) return prev

        const dragX = finalPos ? finalPos.x : draggedCardPos.x
        const dragY = finalPos ? finalPos.y : draggedCardPos.y

        const draggedWidth = draggedCardPos.card.isLeader || draggedCardPos.card.isBase ? 168 : 120
        const draggedHeight = draggedCardPos.card.isLeader || draggedCardPos.card.isBase ? 120 : 168
        const draggedLeft = dragX
        const draggedRight = dragX + draggedWidth
        const draggedTop = dragY
        const draggedBottom = dragY + draggedHeight
        const draggedCenterX = dragX + draggedWidth / 2
        const draggedCenterY = dragY + draggedHeight / 2

        // Find all cards that the dragged card overlaps with
        const overlappingCards: Array<{ cardId: string; pos: CardPosition }> = []
        Object.entries(prev).forEach(([cardId, pos]) => {
          if (cardId === currentDraggedCard || !pos.visible || pos.section !== draggedCardPos.section) return

          const cardWidth = pos.card.isLeader || pos.card.isBase ? 168 : 120
          const cardHeight = pos.card.isLeader || pos.card.isBase ? 120 : 168
          const cardLeft = pos.x
          const cardRight = pos.x + cardWidth
          const cardTop = pos.y
          const cardBottom = pos.y + cardHeight

          const centerOverlap = draggedCenterX >= cardLeft && draggedCenterX <= cardRight &&
                                draggedCenterY >= cardTop && draggedCenterY <= cardBottom

          const overlapX = Math.max(0, Math.min(draggedRight, cardRight) - Math.max(draggedLeft, cardLeft))
          const overlapY = Math.max(0, Math.min(draggedBottom, cardBottom) - Math.max(draggedTop, cardTop))
          const overlapArea = overlapX * overlapY
          const draggedArea = draggedWidth * draggedHeight
          const significantOverlap = overlapArea > (draggedArea * 0.2)

          if (centerOverlap || significantOverlap) {
            overlappingCards.push({ cardId, pos })
          }
        })

        // If there are overlapping cards, cleanup
        if (overlappingCards.length > 0) {
          const updates = { ...prev }

          updates[currentDraggedCard] = {
            ...draggedCardPos,
            x: dragX,
            y: dragY
          }

          const updatedDraggedPos = {
            ...draggedCardPos,
            x: dragX,
            y: dragY
          }

          const allCardsToCleanup = [{ cardId: currentDraggedCard, pos: updatedDraggedPos }, ...overlappingCards]

          const uniqueCardsMap = new Map<string, { cardId: string; pos: CardPosition }>()
          allCardsToCleanup.forEach(({ cardId, pos }) => {
            uniqueCardsMap.set(cardId, { cardId, pos })
          })
          const uniqueCardsArray = Array.from(uniqueCardsMap.values())

          uniqueCardsArray.sort((a, b) => {
            const yDiff = a.pos.y - b.pos.y
            if (Math.abs(yDiff) < 50) {
              return a.pos.x - b.pos.x
            }
            return yDiff
          })

          const leftmostX = Math.min(...uniqueCardsArray.map(c => c.pos.x))
          const topmostY = Math.min(...uniqueCardsArray.map(c => c.pos.y))

          const section = draggedCardPos.section
          const bounds = sectionBounds[section]
          if (bounds) {
            const stackSpacing = 15
            let currentY = topmostY

            uniqueCardsArray.forEach(({ cardId, pos }) => {
              const cardHeight = pos.card.isLeader || pos.card.isBase ? 120 : 168
              const cardWidth = pos.card.isLeader || pos.card.isBase ? 168 : 120
              const constrainedX = Math.max(bounds.minX, Math.min(leftmostX, bounds.maxX - cardWidth))
              const constrainedY = Math.max(bounds.minY, Math.min(currentY, bounds.maxY - cardHeight))

              updates[cardId] = {
                ...(updates[cardId] || pos),
                x: constrainedX,
                y: constrainedY
              }

              currentY = constrainedY + cardHeight + stackSpacing
            })

            return updates
          }
        }

        return prev
      })

      finalDragPositionRef.current = null
      hasDraggedRef.current = false
      setDraggedCard(null)
      setDragOffset({ x: 0, y: 0 })
      setIsShiftDrag(false)
      setTouchingCards(new Set())
    }
  }, [isSelecting, draggedCard, sectionBounds, cardPositions, setCardPositions, setHoveredCard])

  // Add/remove event listeners
  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  return {
    // State
    draggedCard,
    selectedCards,
    setSelectedCards,
    selectionBox,
    isSelecting,
    // Handlers
    handleMouseDown,
    handleCanvasMouseDown,
  }
}

export default useDragAndDrop
