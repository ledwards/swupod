// @ts-nocheck
/**
 * Deck image canvas renderer (shared, browser-only).
 *
 * THE single source of truth for the client-side "deck image" — the canvas PNG
 * with the set-art background, rotated leader, card grid and (pool view) the
 * QR-code footer. Extracted verbatim from useDeckExport so every surface (deck
 * builder, play page, draft/sealed pods) renders the IDENTICAL image and a change
 * here lands everywhere at once.
 *
 * Two views:
 *   renderDeckImageBlob — leader + base + deck + grayscale sideboard (Arial).
 *   renderPoolImageBlob — the "fancy" view: Barlow, site texture, grouped qty
 *                         badges, other leaders/bases, and a QR code to the pool.
 *
 * Returns a PNG Blob (null on failure). Callers own object-URL lifecycle, modal
 * display, status messages and analytics. @ts-nocheck mirrors the source hook;
 * tightening types is a follow-up.
 */
import { getBaseCardId as getBaseCardIdRaw, buildBaseCardMap } from '../../utils/variantDowngrade'
import { cardIdentityKey } from '../../utils/cardNormalization'
import { formatPoolLabel } from '../../utils/poolDisplayName'
import { getPackArtUrl } from '../../utils/packArt'
import QRCode from 'qrcode'

/** Everything a render needs — the deck-builder state shape every surface has. */
export interface DeckImageParams {
  cardPositions: Record<string, { section: string; visible: boolean; enabled?: boolean; card: any }>
  activeLeader: string | null
  activeBase: string | null
  leaderCard: any | null
  baseCard: any | null
  setCode: string
  poolType: 'draft' | 'sealed'
  poolName: string | null
  ownerUsername: string | null
  /** Build/pool shareId + root pool shareId — for the footer URL + QR target. */
  shareId?: string | null
  rootShareId?: string | null
}

// Card-art resolvers, built per setCode (variant normalization → Normal art).
function makeResolvers(setCode: string) {
  const baseCardMap = setCode ? buildBaseCardMap(setCode) : new Map()
  const getBaseCardId = (card: unknown): string => getBaseCardIdRaw(card, baseCardMap) || ''
  // Resolve a deck card to the front art of its NORMAL (standard) variant — never
  // the foil/hyperspace printing the player owns. For a leader the Normal variant's
  // imageUrl is the LEADER side (landscape). Falls back to the card's own art.
  const normalFrontArt = (card: any): string => {
    const normal = baseCardMap.get(cardIdentityKey(card))
    return (normal && normal.imageUrl) || card.frontArt || '/card-back.png'
  }
  return { getBaseCardId, normalFrontArt }
}

// Same-origin image load (set art, texture, logo, QR data URL) — never taints.
const loadSameOrigin = (url: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image()
    img.onload = (): void => resolve(img)
    img.onerror = (): void => resolve(null)
    img.src = url
  })

/**
 * Deck view: leader (rotated) + base, the deck in an 8-col grid, and a grayscale
 * sideboard, over the set-art background. Arial. No QR. (Default modal view.)
 */
export async function renderDeckImageBlob(params: DeckImageParams): Promise<Blob | null> {
  const { cardPositions, leaderCard, baseCard, setCode, poolType } = params
  const currentPoolName = params.poolName
  const poolOwnerUsername = params.ownerUsername
  const { normalFrontArt } = makeResolvers(setCode)

  try {
    // Sort by cost for deck image export
    const costSort = (a, b) => {
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
    const leaderBaseRowHeight = hasLeaderBase ? leaderRotatedHeight : 0
    const footerHeight = poolOwnerUsername ? 100 : 70

    // Hero banner: the set's expansion art runs across the very top, and the
    // same art is tiled (darkened) as the repeating background for the body.
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
    if (!ctx) throw new Error('Failed to get canvas context')

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
    const drawCard = (card, x, y, cardW, cardH, count, grayscale): Promise<void> => {
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
                      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3
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
                    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3
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

    // Draw title at top — the deck/pool name (was previously hardcoded).
    const displayName = currentPoolName || formatPoolLabel(setCode, poolType === 'draft' ? 'draft' : 'sealed')
    ctx.fillStyle = 'white'
    ctx.font = 'bold 32px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(displayName, width / 2, currentY)
    currentY += titleHeight + sectionSpacing

    // Draw selected leader and base at top, centered in one row
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

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png')
    })
  } catch (error) {
    console.error('Error generating deck image:', error)
    return null
  }
}

/**
 * Pool view ("fancy"): Barlow + site texture + set-art hero, grouped qty badges,
 * other leaders/bases, draft sideboard (color) / sealed pool (grayscale), and a
 * QR code to the pool in the footer. This is the canonical shareable image.
 */
export async function renderPoolImageBlob(params: DeckImageParams): Promise<Blob | null> {
  const { cardPositions, activeLeader, activeBase, leaderCard, baseCard, setCode, poolType } = params
  const currentPoolName = params.poolName
  const poolOwnerUsername = params.ownerUsername
  const isDraftMode = poolType === 'draft'
  const poolPublicUrl = `protectthepod.com/pool/${params.rootShareId || params.shareId || ''}`.replace(/\/$/, '')
  const { getBaseCardId, normalFrontArt } = makeResolvers(setCode)

  try {
    // Canvas text uses Barlow — the site font (loaded globally in app/layout.tsx).
    const FONT = 'Barlow, Arial, sans-serif'
    try {
      await Promise.all([
        document.fonts.load('800 32px Barlow'),
        document.fonts.load('600 24px Barlow'),
        document.fonts.load('500 18px Barlow'),
        document.fonts.load('400 16px Barlow'),
      ])
    } catch { /* fall back to Arial */ }

    // Sort by aspect, then type, then cost, then name (default sort)
    const defaultSort = (a, b) => {
      const aspectA = a.aspects?.[0] || ''
      const aspectB = b.aspects?.[0] || ''
      if (aspectA !== aspectB) return aspectA.localeCompare(aspectB)
      const typeA = a.type || ''
      const typeB = b.type || ''
      if (typeA !== typeB) return typeA.localeCompare(typeB)
      const costA = a.cost !== null && a.cost !== undefined ? a.cost : 999
      const costB = b.cost !== null && b.cost !== undefined ? b.cost : 999
      if (costA !== costB) return costA - costB
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

    // Group identical cards into one tile with a quantity, sorted by COST then name.
    const groupCards = (cards) => {
      const m = new Map()
      for (const c of cards) {
        const key = getBaseCardId(c) || `${c.name || ''}|${c.subtitle || ''}`
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
    const leaderBaseRowHeight = hasLeaderBase ? leaderRotatedHeight : 0
    const otherLeadersRowHeight = hasOtherLeadersOrBases ? leaderRotatedHeight : 0
    // QR code (links to the pool) stacks above the "built on Protect the Pod"
    // block in the footer — only when there's a real pool URL to point at.
    const hasPoolUrl = Boolean(params.rootShareId || params.shareId)
    const qrSize = 78
    const footerHeight = (poolOwnerUsername ? 100 : 70) + (hasPoolUrl ? qrSize + 40 : 0)

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
    if (!ctx) throw new Error('Failed to get canvas context')

    const setArtImg = setArtUrl ? await loadSameOrigin(setArtUrl) : null

    // Site background: shared tiled texture + an 80% black overlay (backgrounds.css).
    const textureImg = await loadSameOrigin('/background-images/bg-texture-crop.png')
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
    const drawCard = (card, x, y, cardW, cardH, grayscale): Promise<void> => {
      return new Promise((resolve) => {
        const imageUrl = normalFrontArt(card)

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
                  const avg = (data[i] + data[i + 1] + data[i + 2]) / 3
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
    const drawQtyBadge = (x, y, w, h, count): void => {
      if (!count || count <= 1) return
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
      ctx.beginPath()
      ctx.arc(x + w - 16, y + h - 16, 13, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.fillStyle = 'white'
      ctx.font = `700 15px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${count}`, x + w - 16, y + h - 16)
    }

    currentY = padding + heroHeight

    // Title (deck name) + "Draft Deck" / "Sealed Deck" subtitle.
    const titleText = currentPoolName || formatPoolLabel(setCode, isDraftMode ? 'draft' : 'sealed')
    ctx.fillStyle = 'white'
    ctx.font = `800 32px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(titleText, width / 2, currentY)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.font = `500 18px ${FONT}`
    ctx.fillText(isDraftMode ? 'Draft Deck' : 'Sealed Deck', width / 2, currentY + 38)
    currentY += titleHeight + sectionSpacing

    // Draw selected leader and base at top
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
    ctx.font = `600 24px ${FONT}`
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

    // Draw other leaders/bases in pool (rotated leaders, landscape bases)
    if (hasOtherLeadersOrBases) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
      ctx.font = `600 24px ${FONT}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText('Other Leaders & Bases', padding, currentY)
      currentY += labelHeight

      let totalLBWidth = 0
      for (const card of otherLeaders) totalLBWidth += leaderRotatedWidth + spacing
      for (const card of otherBases) totalLBWidth += leaderRotatedWidth + spacing
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

    // Leftover (non-deck) cards. DRAFT → full-color "Sideboard"; SEALED → dimmed
    // grayscale "Pool" (the leftover sealed pool isn't a curated sideboard).
    ctx.fillStyle = isDraftMode ? 'white' : 'rgba(255, 255, 255, 0.7)'
    ctx.font = `600 24px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(`${isDraftMode ? 'Sideboard' : 'Pool'} (${poolCards.length})`, padding, currentY)
    currentY += labelHeight

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
      ctx.font = `500 20px ${FONT}`
      ctx.fillText(`by ${poolOwnerUsername}`, padding, footerBaseline - 22)
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.font = `400 16px ${FONT}`
    ctx.fillText(timeStr, padding, footerBaseline)

    const logo = await loadSameOrigin('/ptp_logo400.png')
    const logoSize = 46
    if (logo) {
      ctx.drawImage(logo, width - padding - logoSize, footerBaseline - logoSize, logoSize, logoSize)
    }
    const textRight = width - padding - (logo ? logoSize + 12 : 0)
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
    ctx.font = `400 15px ${FONT}`
    ctx.fillText(poolPublicUrl, textRight, footerBaseline - 24)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
    ctx.font = `600 18px ${FONT}`
    ctx.fillText('built on Protect the Pod', textRight, footerBaseline - 1)

    // QR code to the pool, just above the credit block. Generated locally (data
    // URL → no taint), on a white card so it stays scannable over the dark footer.
    if (hasPoolUrl) {
      try {
        const qrDataUrl = await QRCode.toDataURL(`https://${poolPublicUrl}`, {
          margin: 1,
          width: qrSize * 3,
          color: { dark: '#0e0e16', light: '#ffffff' },
        })
        const qrImg = await loadSameOrigin(qrDataUrl)
        if (qrImg) {
          ctx.font = `600 18px ${FONT}`
          const creditWidth = ctx.measureText('built on Protect the Pod').width
          const creditCenterX = textRight - creditWidth / 2
          const pad = 5
          const qrX = Math.round(creditCenterX - qrSize / 2)
          const qrY = footerBaseline - 71 - qrSize
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(qrX - pad, qrY - pad, qrSize + pad * 2, qrSize + pad * 2)
          ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)
        }
      } catch (err) {
        console.warn('QR generation failed; skipping', err)
      }
    }

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png')
    })
  } catch (error) {
    console.error('Error generating pool image:', error)
    return null
  }
}
