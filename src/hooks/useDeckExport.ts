// @ts-nocheck
/**
 * useDeckExport Hook
 *
 * Provides deck export functionality including JSON export, clipboard copy, and image generation.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getBaseCardId as getBaseCardIdRaw, buildBaseCardMap } from '../utils/variantDowngrade'
import { cardIdentityKey } from '../utils/cardNormalization'
import { formatPoolLabel } from '../utils/poolDisplayName'
import { getPackArtUrl } from '../utils/packArt'
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
  /** Current build/pool shareId + the root pool shareId, for the "built on
   *  Protect the Pod" footer URL on the deck image. */
  shareId?: string | null;
  rootShareId?: string | null;
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
  shareId = null,
  rootShareId = null,
}: UseDeckExportProps): UseDeckExportReturn {
  const isDraftMode = poolType === 'draft'
  // Public pool URL for the deck-image footer (root pool when this is a build).
  const poolPublicUrl = `protectthepod.com/pool/${rootShareId || shareId || ''}`.replace(/\/$/, '')

  // Build base card map for variant normalization (handles comma-separated Chaos set codes)
  const baseCardMap = setCode ? buildBaseCardMap(setCode) : new Map()

  // Wrapper that normalizes variant cards to Normal equivalents for export
  function getBaseCardId(card: unknown): string {
    const result = (getBaseCardIdRaw as (card: unknown, map?: unknown) => string | null)(card, baseCardMap)
    return result || ''
  }

  // Resolve a deck card to the front art of its NORMAL (standard) variant — never
  // the foil/hyperspace/showcase printing the player happens to own. For a leader
  // the Normal variant's imageUrl is the LEADER side (landscape); backImageUrl is
  // the unit side. Falls back to the card's own art if the set map can't resolve it.
  function normalFrontArt(card: ExportCard): string {
    const normal = baseCardMap.get(cardIdentityKey(card as unknown as { name: string; type?: string; subtitle?: string | null }))
    return (normal && (normal as { imageUrl?: string }).imageUrl) || card.frontArt || '/card-back.png'
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

      // Hero banner: the set's expansion art runs across the very top, and the
      // same art is tiled (darkened) as the repeating background for the body.
      // Set art lives in /public (same-origin) so it never taints the canvas.
      const setArtUrl = getPackArtUrl(setCode)
      const heroHeight = setArtUrl ? 200 : 0

      const width = padding * 2 + cardsPerRow * cardWidth + (cardsPerRow - 1) * spacing
      const totalHeight = heroHeight + padding * 2 +
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

      // Load the set's expansion art (same-origin → no canvas taint). Falls back
      // to the flat dark grid if the set has no art or the image fails to load.
      const loadSameOrigin = (url: string): Promise<HTMLImageElement | null> =>
        new Promise((resolve) => {
          const img = new Image()
          img.onload = (): void => resolve(img)
          img.onerror = (): void => resolve(null)
          img.src = url
        })
      const setArtImg = setArtUrl ? await loadSameOrigin(setArtUrl) : null

      if (setArtImg) {
        // Base fill.
        ctx.fillStyle = '#0e0e16'
        ctx.fillRect(0, 0, width, totalHeight)

        // Repeating set-art motif (darkened) behind the deck body.
        const tileW = 250
        const tileH = Math.round((tileW * setArtImg.height) / setArtImg.width)
        const tile = document.createElement('canvas')
        tile.width = tileW
        tile.height = tileH
        const tctx = tile.getContext('2d')
        if (tctx) {
          tctx.drawImage(setArtImg, 0, 0, tileW, tileH)
          tctx.fillStyle = 'rgba(14, 14, 22, 0.7)'
          tctx.fillRect(0, 0, tileW, tileH)
          const pattern = ctx.createPattern(tile, 'repeat')
          if (pattern) {
            pattern.setTransform(new DOMMatrix([1, 0, 0, 1, 0, heroHeight]))
            ctx.save()
            ctx.fillStyle = pattern
            ctx.fillRect(0, heroHeight, width, totalHeight - heroHeight)
            ctx.restore()
          }
        }
        // Readability scrim over the tiled body.
        ctx.fillStyle = 'rgba(10, 10, 18, 0.5)'
        ctx.fillRect(0, heroHeight, width, totalHeight - heroHeight)

        // Hero banner: set art across the top, cover-fit, fading into the body.
        const s = Math.max(width / setArtImg.width, heroHeight / setArtImg.height)
        const hw = setArtImg.width * s
        const hh = setArtImg.height * s
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 0, width, heroHeight)
        ctx.clip()
        ctx.drawImage(setArtImg, (width - hw) / 2, (heroHeight - hh) / 2, hw, hh)
        const fade = ctx.createLinearGradient(0, heroHeight - 110, 0, heroHeight)
        fade.addColorStop(0, 'rgba(14, 14, 22, 0)')
        fade.addColorStop(1, 'rgba(14, 14, 22, 0.96)')
        ctx.fillStyle = fade
        ctx.fillRect(0, heroHeight - 110, width, 110)
        ctx.restore()
      } else {
        // Fallback: original flat dark background + faint grid.
        ctx.fillStyle = '#1a1a2e'
        ctx.fillRect(0, 0, width, totalHeight)
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
      }

      let currentY = padding + heroHeight

      // Helper to draw a single card
      const drawCard = (card: ExportCard, x: number, y: number, cardW: number, cardH: number, count: number | null, grayscale: boolean): Promise<void> => {
        return new Promise((resolve) => {
          const imageUrl = normalFrontArt(card)
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

      currentY = padding + heroHeight

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

      // Group identical cards into one tile with a quantity, sorted by COST then
      // alphabetically — so a deck shows "card xN" instead of repeated tiles.
      const groupCards = (cards: ExportCard[]): Array<{ card: ExportCard; count: number }> => {
        const m = new Map<string, { card: ExportCard; count: number }>()
        for (const c of cards) {
          const key = getBaseCardId(c) || `${c.name || ''}|${(c as { subtitle?: string }).subtitle || ''}`
          const e = m.get(key)
          if (e) e.count++
          else m.set(key, { card: c, count: 1 })
        }
        return Array.from(m.values()).sort((a, b) => {
          const ca = a.card.cost ?? 999
          const cb = b.card.cost ?? 999
          if (ca !== cb) return ca - cb
          return (a.card.name || '').toLowerCase().localeCompare((b.card.name || '').toLowerCase())
        })
      }
      const deckGroups = groupCards(deckCards)
      const poolGroups = groupCards(poolCards)

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
      const deckRows = Math.ceil(deckGroups.length / cardsPerRow)
      const poolRows = Math.ceil(poolGroups.length / cardsPerRow)
      const hasLeaderBase = selectedLeader || selectedBase
      const hasOtherLeadersOrBases = otherLeaders.length > 0 || otherBases.length > 0
      // Leader rotated, base landscape — both same height
      const leaderBaseRowHeight = hasLeaderBase ? leaderRotatedHeight : 0
      // Other leaders rotated, other bases landscape — same height
      const otherLeadersRowHeight = hasOtherLeadersOrBases ? leaderRotatedHeight : 0
      const footerHeight = poolOwnerUsername ? 100 : 70

      // Hero banner: set art on top + tiled set-art background (same treatment as
      // the deck image export). Set art is same-origin so the canvas stays exportable.
      const setArtUrl = getPackArtUrl(setCode)
      const heroHeight = setArtUrl ? 200 : 0

      const width = padding * 2 + cardsPerRow * cardWidth + (cardsPerRow - 1) * spacing
      const totalHeight = heroHeight + padding * 2 +
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

      // Set art background (same as exportDeckImage). Same-origin → no taint.
      const loadSameOrigin = (url: string): Promise<HTMLImageElement | null> =>
        new Promise((resolve) => {
          const img = new Image()
          img.onload = (): void => resolve(img)
          img.onerror = (): void => resolve(null)
          img.src = url
        })
      const setArtImg = setArtUrl ? await loadSameOrigin(setArtUrl) : null

      // Site background: the shared tiled texture + an 80% black overlay — the
      // exact treatment used on the homepage and every other page (see
      // backgrounds.css). The set's expansion art sits on top as the hero banner.
      const textureImg = await loadSameOrigin('/background-images/bg-texture-crop.png')
      // Exactly the site's background recipe (backgrounds.css): gray base, the
      // texture scaled to 150% width and tiled vertically, then an 80% black
      // overlay. Reproduces what every page shows.
      ctx.fillStyle = 'rgb(76, 77, 81)'
      ctx.fillRect(0, 0, width, totalHeight)
      if (textureImg) {
        const tw = width * 1.5
        const th = tw * (textureImg.height / textureImg.width)
        const tx = (width - tw) / 2
        for (let ty = 0; ty < totalHeight; ty += th) {
          ctx.drawImage(textureImg, tx, ty, tw, th)
        }
      }
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
      ctx.fillRect(0, 0, width, totalHeight)

      if (setArtImg && heroHeight > 0) {
        const s = Math.max(width / setArtImg.width, heroHeight / setArtImg.height)
        const hw = setArtImg.width * s
        const hh = setArtImg.height * s
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 0, width, heroHeight)
        ctx.clip()
        ctx.drawImage(setArtImg, (width - hw) / 2, (heroHeight - hh) / 2, hw, hh)
        const fade = ctx.createLinearGradient(0, heroHeight - 110, 0, heroHeight)
        fade.addColorStop(0, 'rgba(9, 9, 9, 0)')
        fade.addColorStop(1, 'rgba(9, 9, 9, 0.95)')
        ctx.fillStyle = fade
        ctx.fillRect(0, heroHeight - 110, width, 110)
        ctx.restore()
      }

      let currentY = padding + heroHeight

      // Helper to draw a single card
      const drawCard = (card: ExportCard, x: number, y: number, cardW: number, cardH: number, grayscale: boolean): Promise<void> => {
        return new Promise((resolve) => {
          const imageUrl = normalFrontArt(card)
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
              if (grayscale) {
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

      // Quantity badge for cards with >1 copy — drawn on top, bottom-right.
      const drawQtyBadge = (x: number, y: number, w: number, h: number, count: number): void => {
        if (!count || count <= 1) return
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
        ctx.beginPath()
        ctx.arc(x + w - 16, y + h - 16, 13, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.fillStyle = 'white'
        ctx.font = 'bold 15px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${count}`, x + w - 16, y + h - 16)
      }

      currentY = padding + heroHeight

      // Title (deck name) + "Draft Deck" / "Sealed Deck" subtitle.
      const titleText = currentPoolName || formatPoolLabel(setCode, isDraftMode ? 'draft' : 'sealed')
      ctx.fillStyle = 'white'
      ctx.font = 'bold 32px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(titleText, width / 2, currentY)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.font = '500 18px Arial'
      ctx.fillText(isDraftMode ? 'Draft Deck' : 'Sealed Deck', width / 2, currentY + 38)
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
      for (const { card, count } of deckGroups) {
        const x = padding + col * (cardWidth + spacing)
        const y = currentY + row * (cardHeight + spacing)
        await drawCard(card, x, y, cardWidth, cardHeight, false)
        drawQtyBadge(x, y, cardWidth, cardHeight, count)
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

      // Leftover (non-deck) cards. In DRAFT these are the player's Sideboard,
      // drawn in full color and styled exactly like the main deck (same grouping,
      // qty badges, and cost→name sort). In SEALED they stay the dimmed grayscale
      // "Pool" — the leftover sealed pool isn't a curated sideboard.
      ctx.fillStyle = isDraftMode ? 'white' : 'rgba(255, 255, 255, 0.7)'
      ctx.font = 'bold 24px Arial'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(`${isDraftMode ? 'Sideboard' : 'Pool'} (${poolCards.length})`, padding, currentY)
      currentY += labelHeight

      // Draft sideboard: full color (like the deck). Sealed pool: grayscale.
      col = 0
      row = 0
      for (const { card, count } of poolGroups) {
        const x = padding + col * (cardWidth + spacing)
        const y = currentY + row * (cardHeight + spacing)
        await drawCard(card, x, y, cardWidth, cardHeight, !isDraftMode)
        drawQtyBadge(x, y, cardWidth, cardHeight, count)
        col++
        if (col >= cardsPerRow) {
          col = 0
          row++
        }
      }
      currentY += poolRows * (cardHeight + spacing) + sectionSpacing

      // Footer: credit + timestamp on the left; "built on Protect the Pod"
      // logomark + pool URL on the bottom-right.
      const now = new Date()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      let hours = now.getHours()
      const minutes = String(now.getMinutes()).padStart(2, '0')
      const ampm = hours >= 12 ? 'PM' : 'AM'
      hours = hours % 12
      hours = hours ? hours : 12
      const timeStr = `${month}/${day} ${hours}:${minutes} ${ampm}`

      const footerBaseline = totalHeight - padding / 2
      ctx.textAlign = 'left'
      ctx.textBaseline = 'bottom'
      if (poolOwnerUsername) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
        ctx.font = '20px Arial'
        ctx.fillText(`by ${poolOwnerUsername}`, padding, footerBaseline - 22)
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
      ctx.font = '16px Arial'
      ctx.fillText(timeStr, padding, footerBaseline)

      const logo = await loadSameOrigin('/ptp_logo400.png')
      const logoSize = 46
      if (logo) {
        ctx.drawImage(logo, width - padding - logoSize, footerBaseline - logoSize, logoSize, logoSize)
      }
      const textRight = width - padding - (logo ? logoSize + 12 : 0)
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
      ctx.font = 'bold 18px Arial'
      ctx.fillText('built on Protect the Pod', textRight, footerBaseline - 22)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
      ctx.font = '15px Arial'
      ctx.fillText(poolPublicUrl, textRight, footerBaseline - 1)

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
