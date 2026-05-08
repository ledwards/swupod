// @ts-nocheck
/**
 * useDeckExport Hook
 *
 * Provides deck export functionality including JSON export, clipboard copy, and image generation.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getBaseCardId as getBaseCardIdRaw, buildBaseCardMap } from '../utils/variantDowngrade'
import { formatPoolLabel } from '../utils/poolDisplayName'
import { trackEvent, AnalyticsEvents } from './useAnalytics'

// === TYPES ===

/** Card with properties needed for export */
interface ExportCard {
  id?: string;
  name?: string;
  type?: string;
  cost?: number | null;
  isBase?: boolean;
  isLeader?: boolean;
  frontArt?: string;
  [key: string]: unknown;
}

/** Card position in deck builder */
interface CardPosition {
  section: 'deck' | 'sideboard' | 'pool' | 'leaders' | 'bases';
  visible: boolean;
  enabled?: boolean;
  card: ExportCard;
}

/** Card positions map */
type CardPositionsMap = Record<string, CardPosition>;

/** Deck card entry for export */
interface DeckCardEntry {
  id: string;
  count: number;
}

/** Built deck data structure */
interface DeckData {
  leader: DeckCardEntry | null;
  base: DeckCardEntry | null;
  deck: DeckCardEntry[];
  sideboard: DeckCardEntry[];
}

/** Export data structure for JSON export */
interface ExportData {
  metadata: {
    name: string;
    author: string;
  };
  leader: DeckCardEntry | null;
  base: DeckCardEntry | null;
  deck: DeckCardEntry[];
  sideboard: DeckCardEntry[];
}

/** Message type for status messages */
type MessageType = 'success' | 'error' | null;

/** Props for useDeckExport hook */
interface UseDeckExportProps {
  cardPositions: CardPositionsMap;
  activeLeader: string | null;
  activeBase: string | null;
  leaderCard: ExportCard | null;
  baseCard: ExportCard | null;
  allSetCards: ExportCard[];
  setCode: string;
  poolType: 'draft' | 'sealed';
  currentPoolName: string | null;
  poolOwnerUsername: string | null;
  setErrorMessage: (message: string | null) => void;
  setMessageType: (type: MessageType) => void;
  setDeckImageModal: (url: string | null) => void;
}

/** Return type for useDeckExport hook */
export interface UseDeckExportReturn {
  buildDeckData: () => DeckData;
  exportJSON: () => void;
  copyJSON: () => Promise<void>;
  exportDeckImage: () => Promise<void>;
  exportPoolImage: () => Promise<string | null>;
}

// === HOOK ===

export function useDeckExport({
  cardPositions,
  activeLeader,
  activeBase,
  leaderCard,
  baseCard,
  allSetCards,
  setCode,
  poolType,
  currentPoolName,
  poolOwnerUsername,
  setErrorMessage,
  setMessageType,
  setDeckImageModal,
}: UseDeckExportProps): UseDeckExportReturn {
  const isDraftMode = poolType === 'draft'

  // Build base card map for variant normalization (handles comma-separated Chaos set codes)
  const baseCardMap = setCode ? buildBaseCardMap(setCode) : new Map()

  // Wrapper that normalizes variant cards to Normal equivalents for export
  function getBaseCardId(card: unknown): string {
    const result = (getBaseCardIdRaw as (card: unknown, map?: unknown) => string | null)(card, baseCardMap)
    return result || ''
  }

  // Build deck data structure for export (uses base card IDs for Karabast compatibility)
  const buildDeckData = (): DeckData => {
    // Build set of leader/base IDs to filter from final output
    const leaderBaseIds = new Set<string>()
    allSetCards.forEach(card => {
      if (card.type === 'Leader' || card.type === 'Base') {
        leaderBaseIds.add(getBaseCardId(card))
      }
    })

    // Get cards from deck and sideboard sections (excluding leaders and bases)
    const deckCards = Object.values(cardPositions)
      .filter(pos => pos.section === 'deck' && pos.visible && pos.enabled !== false && !pos.card.isBase && !pos.card.isLeader)
      .map(pos => pos.card)

    const sideboardCards = Object.values(cardPositions)
      .filter(pos => pos.section === 'sideboard' && pos.visible && !pos.card.isBase && !pos.card.isLeader)
      .map(pos => pos.card)

    // Count cards by base ID, excluding leaders and bases
    const deckCounts = new Map<string, number>()
    deckCards.forEach(card => {
      const id = getBaseCardId(card)
      if (!leaderBaseIds.has(id)) {
        deckCounts.set(id, (deckCounts.get(id) || 0) + 1)
      }
    })

    const sideboardCounts = new Map<string, number>()
    sideboardCards.forEach(card => {
      const id = getBaseCardId(card)
      if (!leaderBaseIds.has(id)) {
        sideboardCounts.set(id, (sideboardCounts.get(id) || 0) + 1)
      }
    })

    return {
      leader: leaderCard ? { id: getBaseCardId(leaderCard), count: 1 } : null,
      base: baseCard ? { id: getBaseCardId(baseCard), count: 1 } : null,
      deck: Array.from(deckCounts.entries()).map(([id, count]) => ({ id, count })),
      sideboard: Array.from(sideboardCounts.entries()).map(([id, count]) => ({ id, count }))
    }
  }

  // Export as JSON
  const exportJSON = (): void => {
    if (!activeLeader || !activeBase) {
      const missing: string[] = []
      if (!activeLeader) missing.push('leader')
      if (!activeBase) missing.push('base')
      setErrorMessage(`Please select a ${missing.join(' and ')} before exporting.`)
      setMessageType('error')
      setTimeout(() => {
        setErrorMessage(null)
        setMessageType(null)
      }, 5000)
      return
    }

    setErrorMessage(null)
    setMessageType(null)
    const deckData = buildDeckData()

    const poolDisplayName = currentPoolName || formatPoolLabel(setCode, isDraftMode ? 'draft' : 'sealed')
    const exportData: ExportData = {
      metadata: {
        name: `[PTP] ${poolDisplayName}`.slice(0, 80),
        author: "Protect the Pod"
      },
      leader: deckData.leader,
      base: deckData.base,
      deck: deckData.deck,
      sideboard: deckData.sideboard
    }

    const jsonString = JSON.stringify(exportData, null, 2)
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `[PTP ${poolType === 'draft' ? 'DRAFT' : 'SEALED'}] ${poolDisplayName} Deck.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    trackEvent(AnalyticsEvents.DECK_EXPORTED_JSON, {
      set_code: setCode,
      pool_type: poolType,
      deck_size: deckData.deck.reduce((sum, c) => sum + c.count, 0),
      sideboard_size: deckData.sideboard.reduce((sum, c) => sum + c.count, 0),
    })
  }

  // Copy JSON to clipboard
  const copyJSON = async (): Promise<void> => {
    if (!activeLeader || !activeBase) {
      const missing: string[] = []
      if (!activeLeader) missing.push('leader')
      if (!activeBase) missing.push('base')
      setErrorMessage(`Please select a ${missing.join(' and ')} before copying.`)
      setMessageType('error')
      setTimeout(() => {
        setErrorMessage(null)
        setMessageType(null)
      }, 5000)
      return
    }

    setErrorMessage(null)
    setMessageType(null)
    const deckData = buildDeckData()

    const poolDisplayName = currentPoolName || formatPoolLabel(setCode, isDraftMode ? 'draft' : 'sealed')
    const exportData: ExportData = {
      metadata: {
        name: `[PTP] ${poolDisplayName}`.slice(0, 80),
        author: "Protect the Pod"
      },
      leader: deckData.leader,
      base: deckData.base,
      deck: deckData.deck,
      sideboard: deckData.sideboard
    }

    const jsonString = JSON.stringify(exportData, null, 2)
    try {
      await navigator.clipboard.writeText(jsonString)
      setErrorMessage('JSON copied to clipboard!')
      setMessageType('success')
      setTimeout(() => {
        setErrorMessage(null)
        setMessageType(null)
      }, 3000)

      trackEvent(AnalyticsEvents.DECK_COPIED_JSON, {
        set_code: setCode,
        pool_type: poolType,
        deck_size: deckData.deck.reduce((sum, c) => sum + c.count, 0),
        sideboard_size: deckData.sideboard.reduce((sum, c) => sum + c.count, 0),
      })
    } catch {
      setErrorMessage('Failed to copy to clipboard')
      setMessageType('error')
      setTimeout(() => {
        setErrorMessage(null)
        setMessageType(null)
      }, 3000)
    }
  }

  // Export deck as image
  const exportDeckImage = async (): Promise<void> => {
    try {
      setErrorMessage('Generating image...')
      setMessageType('success')

      // Sort by cost for deck image export
      const costSort = (a: ExportCard, b: ExportCard): number => {
        const costA = a.cost !== null && a.cost !== undefined ? a.cost : 999
        const costB = b.cost !== null && b.cost !== undefined ? b.cost : 999
        if (costA !== costB) return costA - costB
        const nameA = (a.name || '').toLowerCase()
        const nameB = (b.name || '').toLowerCase()
        return nameA.localeCompare(nameB)
      }

      // Get sorted deck and sideboard cards with duplicates
      const deckCards = Object.values(cardPositions)
        .filter(pos => pos.section === 'deck' && pos.visible && pos.enabled !== false && !pos.card.isBase && !pos.card.isLeader)
        .map(pos => pos.card)
        .sort(costSort)

      const sideboardCards = Object.values(cardPositions)
        .filter(pos => pos.section === 'sideboard' && pos.visible && !pos.card.isBase && !pos.card.isLeader)
        .map(pos => pos.card)
        .sort(costSort)

      const selectedLeader = leaderCard
      const selectedBase = baseCard

      // Canvas dimensions
      const padding = 40
      const cardWidth = 150
      const cardHeight = 210
      const spacing = 10
      const titleHeight = 50
      const labelHeight = 40
      const sectionSpacing = 30
      const leaderBaseWidth = 180
      const leaderBaseHeight = 252
      // Leaders are rotated 90 CCW, so their dimensions are swapped
      const leaderRotatedWidth = leaderBaseHeight  // 252
      const leaderRotatedHeight = leaderBaseWidth  // 180
      const cardsPerRow = 8
      const deckRows = Math.ceil(deckCards.length / cardsPerRow)
      const sideboardRows = Math.ceil(sideboardCards.length / cardsPerRow)
      const hasLeaderBase = selectedLeader || selectedBase
      // Leader is rotated (portrait → landscape), base is naturally landscape
      // Both end up as landscape, so row height = leaderRotatedHeight (= leaderBaseWidth = 180)
      const leaderBaseRowHeight = hasLeaderBase ? leaderRotatedHeight : 0
      const footerHeight = poolOwnerUsername ? 100 : 70

      const width = padding * 2 + cardsPerRow * cardWidth + (cardsPerRow - 1) * spacing
      const totalHeight = padding * 2 +
        titleHeight + sectionSpacing +
        (hasLeaderBase ? leaderBaseRowHeight + sectionSpacing : 0) +
        labelHeight + deckRows * (cardHeight + spacing) + sectionSpacing +
        labelHeight + sideboardRows * (cardHeight + spacing) + sectionSpacing +
        footerHeight

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = totalHeight
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        throw new Error('Failed to get canvas context')
      }

      // Dark background
      ctx.fillStyle = '#1a1a2e'
      ctx.fillRect(0, 0, width, totalHeight)

      // Draw grid pattern
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)'
      ctx.lineWidth = 1
      const gridSize = 20
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, totalHeight)
        ctx.stroke()
      }
      for (let y = 0; y < totalHeight; y += gridSize) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }

      let currentY = padding

      // Helper to draw a single card
      const drawCard = (card: ExportCard, x: number, y: number, cardW: number, cardH: number, count: number | null, grayscale: boolean): Promise<void> => {
        return new Promise((resolve) => {
          const imageUrl = card.frontArt || '/card-back.png'
          const isLeader = card.isLeader

          const drawPlaceholder = (): void => {
            ctx.fillStyle = '#333'
            ctx.fillRect(x, y, cardW, cardH)
            ctx.strokeStyle = '#555'
            ctx.strokeRect(x, y, cardW, cardH)
            ctx.fillStyle = '#888'
            ctx.font = '10px Arial'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(card.name || 'Unknown', x + cardW / 2, y + cardH / 2)
            resolve()
          }

          // Try to load image via blob (better for CORS)
          const loadImageViaBlob = (): void => {
            const img = new Image()
            const timeoutId = setTimeout(() => {
              console.warn(`Image load timeout for ${card.name}`)
              drawPlaceholder()
            }, 5000)

            img.onload = (): void => {
              clearTimeout(timeoutId)
              try {
                if (isLeader) {
                  // Rotate leader 90 degrees CCW
                  ctx.save()
                  ctx.translate(x + cardW / 2, y + cardH / 2)
                  ctx.rotate(-Math.PI / 2)
                  if (grayscale) {
                    const tempCanvas = document.createElement('canvas')
                    tempCanvas.width = cardH
                    tempCanvas.height = cardW
                    const tempCtx = tempCanvas.getContext('2d')
                    if (tempCtx) {
                      tempCtx.drawImage(img, 0, 0, cardH, cardW)
                      const imageData = tempCtx.getImageData(0, 0, cardH, cardW)
                      const data = imageData.data
                      for (let i = 0; i < data.length; i += 4) {
                        const avg = (data[i]! + data[i + 1]! + data[i + 2]!) / 3
                        data[i] = avg
                        data[i + 1] = avg
                        data[i + 2] = avg
                      }
                      tempCtx.putImageData(imageData, 0, 0)
                      ctx.drawImage(tempCanvas, -cardH / 2, -cardW / 2, cardH, cardW)
                    }
                  } else {
                    ctx.drawImage(img, -cardH / 2, -cardW / 2, cardH, cardW)
                  }
                  ctx.restore()
                } else if (grayscale) {
                  const tempCanvas = document.createElement('canvas')
                  tempCanvas.width = cardW
                  tempCanvas.height = cardH
                  const tempCtx = tempCanvas.getContext('2d')
                  if (tempCtx) {
                    tempCtx.drawImage(img, 0, 0, cardW, cardH)
                    const imageData = tempCtx.getImageData(0, 0, cardW, cardH)
                    const data = imageData.data
                    for (let i = 0; i < data.length; i += 4) {
                      const avg = (data[i]! + data[i + 1]! + data[i + 2]!) / 3
                      data[i] = avg
                      data[i + 1] = avg
                      data[i + 2] = avg
                    }
                    tempCtx.putImageData(imageData, 0, 0)
                    ctx.drawImage(tempCanvas, x, y, cardW, cardH)
                  }
                } else {
                  ctx.drawImage(img, x, y, cardW, cardH)
                }

                // Draw count badge if count > 1
                if (count && count > 1) {
                  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
                  ctx.beginPath()
                  ctx.arc(x + cardW - 15, y + cardH - 15, 12, 0, Math.PI * 2)
                  ctx.fill()
                  ctx.fillStyle = 'white'
                  ctx.font = 'bold 14px Arial'
                  ctx.textAlign = 'center'
                  ctx.textBaseline = 'middle'
                  ctx.fillText(count.toString(), x + cardW - 15, y + cardH - 15)
                }

                resolve()
              } catch (error) {
                console.error(`Error drawing card ${card.name}:`, error)
                drawPlaceholder()
              }
            }

            img.onerror = (): void => {
              clearTimeout(timeoutId)
              console.warn(`Image load error for ${card.name}: ${imageUrl}`)
              drawPlaceholder()
            }

            img.crossOrigin = 'anonymous'
            img.src = imageUrl
          }

          loadImageViaBlob()
        })
      }

      currentY = padding

      // Draw title at top
      ctx.fillStyle = 'white'
      ctx.font = 'bold 32px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(`Sealed Pod (${setCode})`, width / 2, currentY)
      currentY += titleHeight + sectionSpacing

      // Draw selected leader and base at top, centered in one row
      // Leader rotated 90° CCW, base drawn landscape — both end up same dimensions
      if (selectedLeader || selectedBase) {
        const leaderW = selectedLeader ? leaderRotatedWidth : 0
        const baseW = selectedBase ? leaderRotatedWidth : 0
        const totalWidth = leaderW + baseW + (selectedLeader && selectedBase ? spacing : 0)
        const startX = (width - totalWidth) / 2
        let x = startX
        if (selectedLeader) {
          await drawCard(selectedLeader, x, currentY, leaderRotatedWidth, leaderRotatedHeight, null, false)
          x += leaderRotatedWidth + spacing
        }
        if (selectedBase) {
          await drawCard(selectedBase, x, currentY, leaderRotatedWidth, leaderRotatedHeight, null, false)
        }
        currentY += leaderBaseRowHeight + sectionSpacing
      }

      // Draw "Deck" section label
      ctx.fillStyle = 'white'
      ctx.font = 'bold 24px Arial'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText('Deck', padding, currentY)
      currentY += labelHeight

      // Draw deck cards (in color)
      let col = 0
      let row = 0
      for (const card of deckCards) {
        const x = padding + col * (cardWidth + spacing)
        const y = currentY + row * (cardHeight + spacing)
        await drawCard(card, x, y, cardWidth, cardHeight, null, false)
        col++
        if (col >= cardsPerRow) {
          col = 0
          row++
        }
      }
      currentY += deckRows * (cardHeight + spacing) + sectionSpacing

      // Draw "Sideboard" section label
      ctx.fillStyle = 'white'
      ctx.font = 'bold 24px Arial'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText('Sideboard', padding, currentY)
      currentY += labelHeight

      // Draw sideboard cards (in grayscale)
      col = 0
      row = 0
      for (const card of sideboardCards) {
        const x = padding + col * (cardWidth + spacing)
        const y = currentY + row * (cardHeight + spacing)
        await drawCard(card, x, y, cardWidth, cardHeight, null, true)
        col++
        if (col >= cardsPerRow) {
          col = 0
          row++
        }
      }
      currentY += sideboardRows * (cardHeight + spacing) + sectionSpacing

      // Draw pool name and timestamp at bottom
      const now = new Date()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      let hours = now.getHours()
      const minutes = String(now.getMinutes()).padStart(2, '0')
      const ampm = hours >= 12 ? 'PM' : 'AM'
      hours = hours % 12
      hours = hours ? hours : 12
      const timeStr = `${month}/${day} ${hours}:${minutes} ${ampm}`

      const displayName = currentPoolName || formatPoolLabel(setCode, poolType === 'draft' ? 'draft' : 'sealed')

      // Draw pool name
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.font = 'bold 24px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(displayName, width / 2, totalHeight - padding / 2 - 40)

      // Draw "by {username}" if available
      if (poolOwnerUsername) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
        ctx.font = '20px Arial'
        ctx.fillText(`by ${poolOwnerUsername}`, width / 2, totalHeight - padding / 2 - 15)
      }

      // Draw timestamp below name
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.font = '18px Arial'
      ctx.fillText(timeStr, width / 2, totalHeight - padding / 2)

      // Show image in modal instead of downloading
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob)
          setDeckImageModal(url)
          setErrorMessage('Image generated!')
          setMessageType('success')
          setTimeout(() => {
            setErrorMessage(null)
            setMessageType(null)
          }, 3000)

          trackEvent(AnalyticsEvents.DECK_IMAGE_GENERATED, {
            set_code: setCode,
            pool_type: poolType,
            deck_size: deckCards.length,
            sideboard_size: sideboardCards.length,
          })
        }
      }, 'image/png')

    } catch (error) {
      console.error('Error generating deck image:', error)
      setErrorMessage('Failed to generate image')
      setMessageType('error')
      setTimeout(() => {
        setErrorMessage(null)
        setMessageType(null)
      }, 3000)
    }
  }

  // Export pool image (shows deck + pool cards)
  const exportPoolImage = async (): Promise<string | null> => {
    try {
      // Sort by aspect, then type, then cost, then name (default sort)
      const defaultSort = (a: ExportCard, b: ExportCard): number => {
        // Sort by first aspect
        const aspectA = (a as { aspects?: string[] }).aspects?.[0] || ''
        const aspectB = (b as { aspects?: string[] }).aspects?.[0] || ''
        if (aspectA !== aspectB) return aspectA.localeCompare(aspectB)
        // Then by type
        const typeA = a.type || ''
        const typeB = b.type || ''
        if (typeA !== typeB) return typeA.localeCompare(typeB)
        // Then by cost
        const costA = a.cost !== null && a.cost !== undefined ? a.cost : 999
        const costB = b.cost !== null && b.cost !== undefined ? b.cost : 999
        if (costA !== costB) return costA - costB
        // Then by name
        const nameA = (a.name || '').toLowerCase()
        const nameB = (b.name || '').toLowerCase()
        return nameA.localeCompare(nameB)
      }

      // Get deck cards (same as deck image)
      const deckCards = Object.values(cardPositions)
        .filter(pos => pos.section === 'deck' && pos.visible && pos.enabled !== false && !pos.card.isBase && !pos.card.isLeader)
        .map(pos => pos.card)
        .sort(defaultSort)

      // Get pool cards (sideboard, not in deck)
      const poolCards = Object.values(cardPositions)
        .filter(pos => pos.section === 'sideboard' && pos.visible && !pos.card.isBase && !pos.card.isLeader)
        .map(pos => pos.card)
        .sort(defaultSort)

      // Get other leaders (not the active leader)
      const otherLeaders = Object.entries(cardPositions)
        .filter(([cardId, pos]) => pos.visible && pos.card.isLeader && cardId !== activeLeader)
        .map(([_, pos]) => pos.card)

      // Get other bases (not the active base)
      const otherBases = Object.entries(cardPositions)
        .filter(([cardId, pos]) => pos.visible && pos.card.isBase && cardId !== activeBase)
        .map(([_, pos]) => pos.card)

      const selectedLeader = leaderCard
      const selectedBase = baseCard

      // Canvas dimensions (90% of normal to reduce file size for Discord)
      const padding = 36
      const cardWidth = 135
      const cardHeight = 189
      const spacing = 9
      const titleHeight = 45
      const labelHeight = 36
      const sectionSpacing = 27
      const leaderBaseWidth = 162
      const leaderBaseHeight = 227
      // Leaders are rotated 90 CCW, so their dimensions are swapped
      const leaderRotatedWidth = leaderBaseHeight  // 227
      const leaderRotatedHeight = leaderBaseWidth  // 162
      const cardsPerRow = 8
      const separatorHeight = 4
      const deckRows = Math.ceil(deckCards.length / cardsPerRow)
      const poolRows = Math.ceil(poolCards.length / cardsPerRow)
      const hasLeaderBase = selectedLeader || selectedBase
      const hasOtherLeadersOrBases = otherLeaders.length > 0 || otherBases.length > 0
      // Leader rotated, base landscape — both same height
      const leaderBaseRowHeight = hasLeaderBase ? leaderRotatedHeight : 0
      // Other leaders rotated, other bases landscape — same height
      const otherLeadersRowHeight = hasOtherLeadersOrBases ? leaderRotatedHeight : 0
      const footerHeight = poolOwnerUsername ? 100 : 70

      const width = padding * 2 + cardsPerRow * cardWidth + (cardsPerRow - 1) * spacing
      const totalHeight = padding * 2 +
        titleHeight + sectionSpacing +
        (hasLeaderBase ? leaderBaseRowHeight + sectionSpacing : 0) +
        labelHeight + deckRows * (cardHeight + spacing) + sectionSpacing +
        separatorHeight + sectionSpacing +
        (hasOtherLeadersOrBases ? labelHeight + otherLeadersRowHeight + sectionSpacing : 0) +
        labelHeight + poolRows * (cardHeight + spacing) + sectionSpacing +
        footerHeight

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = totalHeight
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        throw new Error('Failed to get canvas context')
      }

      // Dark background
      ctx.fillStyle = '#1a1a2e'
      ctx.fillRect(0, 0, width, totalHeight)

      // Draw grid pattern
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)'
      ctx.lineWidth = 1
      const gridSize = 20
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, totalHeight)
        ctx.stroke()
      }
      for (let y = 0; y < totalHeight; y += gridSize) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }

      let currentY = padding

      // Helper to draw a single card
      const drawCard = (card: ExportCard, x: number, y: number, cardW: number, cardH: number, grayscale: boolean): Promise<void> => {
        return new Promise((resolve) => {
          const imageUrl = card.frontArt || '/card-back.png'
          const isLeader = card.isLeader

          const drawPlaceholder = (): void => {
            ctx.fillStyle = '#333'
            ctx.fillRect(x, y, cardW, cardH)
            ctx.strokeStyle = '#555'
            ctx.strokeRect(x, y, cardW, cardH)
            ctx.fillStyle = '#888'
            ctx.font = '10px Arial'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(card.name || 'Unknown', x + cardW / 2, y + cardH / 2)
            resolve()
          }

          const img = new Image()
          const timeoutId = setTimeout(() => {
            drawPlaceholder()
          }, 5000)

          img.onload = (): void => {
            clearTimeout(timeoutId)
            try {
              if (isLeader) {
                // Rotate leader 90 degrees CCW
                ctx.save()
                ctx.translate(x + cardW / 2, y + cardH / 2)
                ctx.rotate(-Math.PI / 2)
                if (grayscale) {
                  const tempCanvas = document.createElement('canvas')
                  tempCanvas.width = cardH
                  tempCanvas.height = cardW
                  const tempCtx = tempCanvas.getContext('2d')
                  if (tempCtx) {
                    tempCtx.drawImage(img, 0, 0, cardH, cardW)
                    const imageData = tempCtx.getImageData(0, 0, cardH, cardW)
                    const data = imageData.data
                    for (let i = 0; i < data.length; i += 4) {
                      const avg = (data[i]! + data[i + 1]! + data[i + 2]!) / 3
                      data[i] = avg
                      data[i + 1] = avg
                      data[i + 2] = avg
                    }
                    tempCtx.putImageData(imageData, 0, 0)
                    ctx.drawImage(tempCanvas, -cardH / 2, -cardW / 2, cardH, cardW)
                  }
                } else {
                  ctx.drawImage(img, -cardH / 2, -cardW / 2, cardH, cardW)
                }
                ctx.restore()
              } else if (grayscale) {
                const tempCanvas = document.createElement('canvas')
                tempCanvas.width = cardW
                tempCanvas.height = cardH
                const tempCtx = tempCanvas.getContext('2d')
                if (tempCtx) {
                  tempCtx.drawImage(img, 0, 0, cardW, cardH)
                  const imageData = tempCtx.getImageData(0, 0, cardW, cardH)
                  const data = imageData.data
                  for (let i = 0; i < data.length; i += 4) {
                    const avg = (data[i]! + data[i + 1]! + data[i + 2]!) / 3
                    data[i] = avg
                    data[i + 1] = avg
                    data[i + 2] = avg
                  }
                  tempCtx.putImageData(imageData, 0, 0)
                  ctx.drawImage(tempCanvas, x, y, cardW, cardH)
                }
              } else {
                ctx.drawImage(img, x, y, cardW, cardH)
              }
              resolve()
            } catch {
              drawPlaceholder()
            }
          }

          img.onerror = (): void => {
            clearTimeout(timeoutId)
            drawPlaceholder()
          }

          img.crossOrigin = 'anonymous'
          img.src = imageUrl
        })
      }

      currentY = padding

      // Draw title at top
      ctx.fillStyle = 'white'
      ctx.font = 'bold 32px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(`Sealed Pool (${setCode})`, width / 2, currentY)
      currentY += titleHeight + sectionSpacing

      // Draw selected leader and base at top
      // Leader rotated 90° CCW, base drawn landscape — both end up same dimensions
      if (selectedLeader || selectedBase) {
        const leaderW = selectedLeader ? leaderRotatedWidth : 0
        const baseW = selectedBase ? leaderRotatedWidth : 0
        const totalWidth = leaderW + baseW + (selectedLeader && selectedBase ? spacing : 0)
        const startX = (width - totalWidth) / 2
        let x = startX
        if (selectedLeader) {
          await drawCard(selectedLeader, x, currentY, leaderRotatedWidth, leaderRotatedHeight, false)
          x += leaderRotatedWidth + spacing
        }
        if (selectedBase) {
          await drawCard(selectedBase, x, currentY, leaderRotatedWidth, leaderRotatedHeight, false)
        }
        currentY += leaderBaseRowHeight + sectionSpacing
      }

      // Draw "Deck" section label
      ctx.fillStyle = 'white'
      ctx.font = 'bold 24px Arial'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(`Deck (${deckCards.length})`, padding, currentY)
      currentY += labelHeight

      // Draw deck cards
      let col = 0
      let row = 0
      for (const card of deckCards) {
        const x = padding + col * (cardWidth + spacing)
        const y = currentY + row * (cardHeight + spacing)
        await drawCard(card, x, y, cardWidth, cardHeight, false)
        col++
        if (col >= cardsPerRow) {
          col = 0
          row++
        }
      }
      currentY += deckRows * (cardHeight + spacing) + sectionSpacing

      // Draw separator line
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
      ctx.fillRect(padding, currentY, width - padding * 2, separatorHeight)
      currentY += separatorHeight + sectionSpacing

      // Draw other leaders/bases in pool
      // Leaders are rotated 90 CCW so they use swapped dimensions
      if (hasOtherLeadersOrBases) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
        ctx.font = 'bold 24px Arial'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText('Other Leaders & Bases', padding, currentY)
        currentY += labelHeight

        // Calculate total width accounting for different leader/base dimensions
        let totalLBWidth = 0
        for (const card of otherLeaders) {
          totalLBWidth += leaderRotatedWidth + spacing
        }
        for (const card of otherBases) {
          totalLBWidth += leaderRotatedWidth + spacing
        }
        totalLBWidth -= spacing // Remove last spacing

        const startX = Math.max(padding, (width - totalLBWidth) / 2)
        let x = startX
        for (const card of otherLeaders) {
          await drawCard(card, x, currentY, leaderRotatedWidth, leaderRotatedHeight, true)
          x += leaderRotatedWidth + spacing
        }
        for (const card of otherBases) {
          await drawCard(card, x, currentY, leaderRotatedWidth, leaderRotatedHeight, true)
          x += leaderRotatedWidth + spacing
        }
        currentY += otherLeadersRowHeight + sectionSpacing
      }

      // Draw "Pool" section label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
      ctx.font = 'bold 24px Arial'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(`Pool (${poolCards.length})`, padding, currentY)
      currentY += labelHeight

      // Draw pool cards (in grayscale)
      col = 0
      row = 0
      for (const card of poolCards) {
        const x = padding + col * (cardWidth + spacing)
        const y = currentY + row * (cardHeight + spacing)
        await drawCard(card, x, y, cardWidth, cardHeight, true)
        col++
        if (col >= cardsPerRow) {
          col = 0
          row++
        }
      }
      currentY += poolRows * (cardHeight + spacing) + sectionSpacing

      // Draw pool name and timestamp at bottom
      const now = new Date()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      let hours = now.getHours()
      const minutes = String(now.getMinutes()).padStart(2, '0')
      const ampm = hours >= 12 ? 'PM' : 'AM'
      hours = hours % 12
      hours = hours ? hours : 12
      const timeStr = `${month}/${day} ${hours}:${minutes} ${ampm}`

      const displayName = currentPoolName || formatPoolLabel(setCode, poolType === 'draft' ? 'draft' : 'sealed')

      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.font = 'bold 24px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(displayName, width / 2, totalHeight - padding / 2 - 40)

      if (poolOwnerUsername) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
        ctx.font = '20px Arial'
        ctx.fillText(`by ${poolOwnerUsername}`, width / 2, totalHeight - padding / 2 - 15)
      }

      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.font = '18px Arial'
      ctx.fillText(timeStr, width / 2, totalHeight - padding / 2)

      // Return blob URL
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob)

            trackEvent(AnalyticsEvents.POOL_IMAGE_GENERATED, {
              set_code: setCode,
              pool_type: poolType,
              deck_size: deckCards.length,
              pool_size: poolCards.length,
              other_leaders: otherLeaders.length,
              other_bases: otherBases.length,
            })

            resolve(url)
          } else {
            resolve(null)
          }
        }, 'image/png')
      })

    } catch (error) {
      console.error('Error generating pool image:', error)
      return null
    }
  }

  return {
    buildDeckData,
    exportJSON,
    copyJSON,
    exportDeckImage,
    exportPoolImage,
  }
}

export default useDeckExport
