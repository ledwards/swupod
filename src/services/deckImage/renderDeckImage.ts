// @ts-nocheck
/**
 * Deck image canvas renderer (shared, browser-only).
 *
 * THE single source of truth for the client-side "deck image" — the canvas PNG
 * with the set-art hero (overlaid title), card grids and the QR/logo footer.
 * Every surface (deck builder, play page, draft/sealed pods) renders the
 * IDENTICAL image, so a change here lands everywhere at once.
 *
 * One renderer: renderPoolImageBlob(params). params.showSideboard controls the
 * layout — true lays the sideboard/pool column beside the deck (split by a
 * divider rule); false renders a deck-only column. Defaults to true for draft,
 * false for sealed. renderDeckImageBlob is a thin showSideboard:false wrapper
 * kept so existing callers keep working through the one renderer.
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
  /** Show the sideboard/pool column beside the deck. Defaults to true for
   *  draft, false for sealed. The play page's show/hide toggle drives it. */
  showSideboard?: boolean
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
  // imageUrl is the LEADER side (landscape). Falls back to the card's own art:
  // frontArt, then imageUrl (the field pool payloads actually carry). Without
  // the imageUrl step, a caller whose card cache is cold renders every card as
  // a grey placeholder. The last resort is the real card-back path — the
  // asset lives under /card-images/, not at the root.
  const normalFrontArt = (card: any): string => {
    const normal = baseCardMap.get(cardIdentityKey(card))
    return (normal && normal.imageUrl) || card.frontArt || card.imageUrl || '/card-images/card-back.png'
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
 * Deck-only image — the canonical pool renderer with the sideboard/pool column
 * hidden (showSideboard: false). A thin wrapper so existing callers and the
 * index export keep working through the one renderer.
 */
export async function renderDeckImageBlob(params: DeckImageParams): Promise<Blob | null> {
  return renderPoolImageBlob({ ...params, showSideboard: false })
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
  // Whether to render the sideboard/pool column beside the deck. Caller-controlled;
  // defaults to showing for draft and hiding for sealed.
  const showSideboard = params.showSideboard ?? isDraftMode
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

    // Dedupe leader/base lists by identity so duplicate copies aren't shown twice.
    const dedupeByIdentity = (cards) => {
      const seen = new Set()
      return cards.filter(c => {
        const k = cardIdentityKey(c)
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
    }

    // Other leaders (not the active leader), deduped.
    const otherLeaders = dedupeByIdentity(
      Object.entries(cardPositions)
        .filter(([cardId, pos]) => pos.visible && pos.card.isLeader && cardId !== activeLeader)
        .map(([_, pos]) => pos.card)
    )

    // Other bases (not the active base), deduped. Common bases are pool filler —
    // every pack ships one — so they're excluded; only a notable (non-common)
    // alternate base shows.
    const otherBases = dedupeByIdentity(
      Object.entries(cardPositions)
        .filter(([cardId, pos]) => pos.visible && pos.card.isBase && cardId !== activeBase && pos.card.rarity !== 'Common')
        .map(([_, pos]) => pos.card)
    )

    const selectedLeader = leaderCard
    const selectedBase = baseCard

    // ===== Layout constants (compact: the title now lives in the hero header,
    // and DRAFT lays the sideboard out beside the deck rather than stacked) =====
    const padding = 36
    const cardWidth = 135
    const cardHeight = 189
    const spacing = 9
    const labelHeight = 32
    const sectionGap = 16
    const leaderW = 227   // leaders & bases render landscape
    const leaderH = 162
    const colCount = 5    // cards per row in the deck column (and sideboard column)
    const gutter = 72     // gap between the two columns (the divider sits centered in it)

    const setArtUrl = getPackArtUrl(setCode)
    const heroHeight = setArtUrl ? 188 : 0
    const headerH = heroHeight > 0 ? heroHeight : 112
    const bodyTop = headerH + 24

    // Brand block (PTP logo + QR + pool URL) tucks into the bottom-right corner
    // instead of taking its own full-height row. The logo matches the QR size.
    const hasPoolUrl = Boolean(params.rootShareId || params.shareId)
    const qrSize = 84
    const logoSize = qrSize
    const urlLineH = 22
    const brandBlockH = qrSize + 6 + urlLineH
    const brandSlots = 2  // brand block is ~2 card slots wide

    // Pure-arithmetic measure helpers (no drawing happens here).
    const gridHeight = (rows) => (rows <= 0 ? 0 : rows * cardHeight + (rows - 1) * spacing)
    const bandHeight = (rows) => (rows <= 0 ? 0 : rows * leaderH + (rows - 1) * spacing)
    const leadersPerRow = (colW) => Math.max(1, Math.floor((colW + spacing) / (leaderW + spacing)))
    const leaderRowsFor = (count, colW) => (count <= 0 ? 0 : Math.ceil(count / leadersPerRow(colW)))

    const pickedLB = [selectedLeader, selectedBase].filter(Boolean)
    const otherLB = [...otherLeaders, ...otherBases]

    // Layout record — filled in this measure pass, consumed by the draw pass.
    const L = {}
    let width = 0
    let totalHeight = 0

    const colW = colCount * cardWidth + (colCount - 1) * spacing

    if (showSideboard) {
      // Two columns: deck (left) | sideboard/pool (right), split by a vertical
      // rule. The sideboard is ALWAYS the right column, never stacked below.
      width = padding + colW + gutter + colW + padding
      const leftColX = padding
      const rightColX = padding + colW + gutter
      const dividerX = padding + colW + gutter / 2

      // The leader band is as tall as the busier side so the two card grids
      // below it line up (cards with cards), with the unused leaders top-aligned
      // to the picked leader.
      const leaderRows = Math.max(1, leaderRowsFor(pickedLB.length, colW), leaderRowsFor(otherLB.length, colW))
      const leaderBandH = bandHeight(leaderRows)
      const leaderRowY = bodyTop
      const labelY = leaderRowY + leaderBandH + sectionGap
      const gridTopY = labelY + labelHeight
      const deckBottom = gridTopY + gridHeight(Math.ceil(deckGroups.length / colCount))
      const sideBottom = gridTopY + gridHeight(Math.ceil(poolGroups.length / colCount))
      const naturalBottom = Math.max(deckBottom, sideBottom)

      // Brand block sits bottom-right. Prefer the empty space below the (usually
      // shorter) sideboard column; else tuck it into that column's last-row
      // trailing slots; else drop it to its own row.
      const sideRowCount = poolGroups.length === 0 ? 0 : ((poolGroups.length - 1) % colCount) + 1
      let contentBottom, brandBottomY
      if (naturalBottom - brandBlockH >= sideBottom + sectionGap) {
        contentBottom = naturalBottom
        brandBottomY = naturalBottom
      } else if (poolGroups.length > 0 && colCount - sideRowCount >= brandSlots) {
        contentBottom = naturalBottom
        brandBottomY = sideBottom
      } else {
        contentBottom = naturalBottom + sectionGap + brandBlockH
        brandBottomY = contentBottom
      }
      totalHeight = contentBottom + padding

      Object.assign(L, {
        twoCol: true, leftColX, rightColX, colW, dividerX, leaderRowY, labelY,
        gridTopY, colsBottom: naturalBottom, brandRightX: width - padding, brandBottomY,
      })
    } else {
      // Single column: deck only (no sideboard/pool, no unused leaders).
      width = padding + colW + padding
      const colX = padding
      const lbRows = pickedLB.length > 0 ? 1 : 0

      let y = bodyTop
      const lbY = y
      y += bandHeight(lbRows) + (lbRows ? sectionGap : 0)
      const deckLabelY = y
      y += labelHeight
      const deckGridY = y
      const deckBottom = deckGridY + gridHeight(Math.ceil(deckGroups.length / colCount))

      // Brand block tucks into the deck's bottom-row trailing slots; if the last
      // two slots are taken it drops to its own row beneath.
      const deckRowCount = deckGroups.length === 0 ? 0 : ((deckGroups.length - 1) % colCount) + 1
      const inline = deckGroups.length > 0 && colCount - deckRowCount >= brandSlots
      const contentBottom = inline ? deckBottom : deckBottom + sectionGap + brandBlockH
      totalHeight = contentBottom + padding

      Object.assign(L, {
        twoCol: false, colX, colW, lbY, deckLabelY, deckGridY,
        brandRightX: width - padding, brandBottomY: contentBottom,
      })
    }

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

    // Hero header: set art across the top with a deep fade so the overlaid
    // title/subtitle stay legible.
    if (setArtImg && heroHeight > 0) {
      const s = Math.max(width / setArtImg.width, heroHeight / setArtImg.height)
      const hw = setArtImg.width * s
      const hh = setArtImg.height * s
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, width, heroHeight)
      ctx.clip()
      ctx.drawImage(setArtImg, (width - hw) / 2, (heroHeight - hh) / 2, hw, hh)
      const fade = ctx.createLinearGradient(0, heroHeight - 150, 0, heroHeight)
      fade.addColorStop(0, 'rgba(9, 9, 9, 0)')
      fade.addColorStop(1, 'rgba(9, 9, 9, 0.92)')
      ctx.fillStyle = fade
      ctx.fillRect(0, heroHeight - 150, width, 150)
      ctx.restore()
    }

    // Title + subtitle + credit, overlaid large on the hero (previously their
    // own stacked row below it). Leaders stay on the dark/pattern body below.
    const titleText = currentPoolName || formatPoolLabel(setCode, isDraftMode ? 'draft' : 'sealed')
    const now = new Date()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    let hr = now.getHours()
    const min = String(now.getMinutes()).padStart(2, '0')
    const ampm = hr >= 12 ? 'PM' : 'AM'
    hr = hr % 12 || 12
    const stamp = `${mm}/${dd} ${hr}:${min} ${ampm}`
    const creditText = poolOwnerUsername ? `by ${poolOwnerUsername} · ${stamp}` : stamp

    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)'
    ctx.shadowBlur = 10
    ctx.shadowOffsetY = 2
    ctx.fillStyle = 'white'
    ctx.font = `800 50px ${FONT}`
    ctx.fillText(titleText, width / 2, headerH - 58)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
    ctx.font = `600 25px ${FONT}`
    ctx.fillText(isDraftMode ? 'Draft Deck' : 'Sealed Deck', width / 2, headerH - 26)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.font = `500 15px ${FONT}`
    ctx.fillText(creditText, width / 2, headerH - 4)
    ctx.restore()

    // Static foil sheen — the canvas equivalent of the CSS `.canvas-card.foil`
    // shimmer (same rainbow gradient stops). A PNG can't animate, so we bake a
    // single diagonal pass over the standard card art. Reuses the existing foil
    // look rather than inventing a new one.
    const drawFoilSheen = (x, y, cardW, cardH): void => {
      const grad = ctx.createLinearGradient(x, y + cardH, x + cardW, y)
      grad.addColorStop(0.0, 'rgba(255, 0, 0, 0)')
      grad.addColorStop(0.15, 'rgba(255, 0, 0, 0.35)')
      grad.addColorStop(0.25, 'rgba(255, 127, 0, 0.4)')
      grad.addColorStop(0.35, 'rgba(255, 255, 0, 0.45)')
      grad.addColorStop(0.45, 'rgba(0, 255, 0, 0.45)')
      grad.addColorStop(0.55, 'rgba(0, 0, 255, 0.45)')
      grad.addColorStop(0.65, 'rgba(75, 0, 130, 0.4)')
      grad.addColorStop(0.75, 'rgba(148, 0, 211, 0.35)')
      grad.addColorStop(0.85, 'rgba(148, 0, 211, 0)')
      grad.addColorStop(1.0, 'rgba(148, 0, 211, 0)')
      ctx.save()
      ctx.globalCompositeOperation = 'overlay'
      ctx.globalAlpha = 0.8
      ctx.fillStyle = grad
      ctx.fillRect(x, y, cardW, cardH)
      ctx.restore()
    }

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
            // Foils get the holographic sheen on top of the standard art.
            if (card.isFoil) drawFoilSheen(x, y, cardW, cardH)
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
      const r = 26            // doubled from 13
      const cx = x + w - r - 3
      const cy = y + h - r - 3
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)'
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.fillStyle = 'white'
      ctx.font = `700 30px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${count}`, cx, cy)
    }

    // ---- Card-grid + leader-row draw helpers (consume the measured layout) ----
    const drawGrid = async (groups, originX, topY, cols, grayscale) => {
      for (let i = 0; i < groups.length; i++) {
        const x = originX + (i % cols) * (cardWidth + spacing)
        const y = topY + Math.floor(i / cols) * (cardHeight + spacing)
        await drawCard(groups[i].card, x, y, cardWidth, cardHeight, grayscale)
        drawQtyBadge(x, y, cardWidth, cardHeight, groups[i].count)
      }
    }
    // Leaders/bases render landscape and wrap, centered, within a column width.
    const drawLeaders = async (cards, originX, topY, colW, grayscale) => {
      const per = leadersPerRow(colW)
      for (let i = 0; i < cards.length; i++) {
        const r = Math.floor(i / per)
        const inRow = Math.min(per, cards.length - r * per)
        const rowW = inRow * leaderW + (inRow - 1) * spacing
        const x = originX + (colW - rowW) / 2 + (i - r * per) * (leaderW + spacing)
        const y = topY + r * (leaderH + spacing)
        await drawCard(cards[i], x, y, leaderW, leaderH, grayscale)
      }
    }
    const label = (text, x, y, color) => {
      ctx.fillStyle = color
      ctx.font = `600 24px ${FONT}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(text, x, y)
    }
    // Brand block: [PTP logo] [QR] on a row, the pool URL in white below the QR.
    // QR generated locally (data URL → no taint) on a white card so it stays
    // scannable over the dark body.
    const drawBrand = async (rightX, bottomY) => {
      const qrX = rightX - qrSize
      const qrTop = bottomY - urlLineH - 6 - qrSize
      if (hasPoolUrl) {
        try {
          const qrDataUrl = await QRCode.toDataURL(`https://${poolPublicUrl}`, {
            margin: 1,
            width: qrSize * 3,
            color: { dark: '#0e0e16', light: '#ffffff' },
          })
          const qrImg = await loadSameOrigin(qrDataUrl)
          if (qrImg) {
            const pad = 5
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(qrX - pad, qrTop - pad, qrSize + pad * 2, qrSize + pad * 2)
            ctx.drawImage(qrImg, qrX, qrTop, qrSize, qrSize)
          }
        } catch (err) {
          console.warn('QR generation failed; skipping', err)
        }
      }
      // Logo centered in the space left of the QR — equidistant from the URL's
      // left end and the QR's left edge (i.e. centered on the URL's left half).
      ctx.font = `600 16px ${FONT}`
      const urlW = hasPoolUrl ? ctx.measureText(poolPublicUrl).width : 0
      const urlLeft = rightX - urlW
      const logo = await loadSameOrigin('/ptp_logo1024.png')
      if (logo) {
        const logoX = hasPoolUrl ? (urlLeft + qrX - logoSize) / 2 : qrX - 16 - logoSize
        ctx.drawImage(logo, logoX, qrTop + (qrSize - logoSize) / 2, logoSize, logoSize)
      }
      if (hasPoolUrl) {
        ctx.textAlign = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillStyle = '#ffffff'
        ctx.font = `600 16px ${FONT}`
        ctx.fillText(poolPublicUrl, rightX, bottomY)
      }
    }

    if (L.twoCol) {
      // Vertical rule between the deck (left) and sideboard (right) columns,
      // with a soft glow so it reads clearly over the busy body.
      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
      ctx.shadowBlur = 4
      ctx.fillStyle = 'rgba(255, 255, 255, 0.32)'
      // Trim half a card-width off the top and bottom so the rule is shorter and
      // stays vertically centered between the leader row and the columns' bottom.
      const dvTrim = cardWidth / 2
      ctx.fillRect(L.dividerX - 1, L.leaderRowY + dvTrim, 2, (L.colsBottom - L.leaderRowY) - cardWidth)
      ctx.restore()

      // Picked leader+base (left) and unused leaders+bases (right), top-aligned.
      await drawLeaders(pickedLB, L.leftColX, L.leaderRowY, L.colW, false)
      await drawLeaders(otherLB, L.rightColX, L.leaderRowY, L.colW, true)

      // Draft → full-colour "Sideboard"; sealed → dimmed grayscale "Pool".
      label(`Deck (${deckCards.length})`, L.leftColX, L.labelY, 'white')
      label(`${isDraftMode ? 'Sideboard' : 'Pool'} (${poolCards.length})`, L.rightColX, L.labelY, 'white')

      // Deck and sideboard grids start at the same Y, same sort order.
      await drawGrid(deckGroups, L.leftColX, L.gridTopY, colCount, false)
      await drawGrid(poolGroups, L.rightColX, L.gridTopY, colCount, !isDraftMode)
    } else {
      // Deck-only: picked leader+base, then the deck grid.
      if (pickedLB.length) {
        await drawLeaders(pickedLB, L.colX, L.lbY, L.colW, false)
      }
      label(`Deck (${deckCards.length})`, L.colX, L.deckLabelY, 'white')
      await drawGrid(deckGroups, L.colX, L.deckGridY, colCount, false)
    }

    await drawBrand(L.brandRightX, L.brandBottomY)

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png')
    })
  } catch (error) {
    console.error('Error generating pool image:', error)
    return null
  }
}
