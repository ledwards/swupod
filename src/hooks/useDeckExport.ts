// @ts-nocheck
/**
 * useDeckExport Hook
 *
 * Provides deck export functionality including JSON export, clipboard copy, and image generation.
 * Image rendering lives in src/services/deckImage (shared with the play page and pods).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getBaseCardId as getBaseCardIdRaw, buildBaseCardMap } from '../utils/variantDowngrade'
import { formatPoolLabel } from '../utils/poolDisplayName'
import { trackEvent, AnalyticsEvents } from './useAnalytics'
import { renderPoolImageBlob } from '../services/deckImage'

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

  // Shared params for the canvas renderers (src/services/deckImage).
  const imageParams = () => ({
    cardPositions,
    activeLeader,
    activeBase,
    leaderCard,
    baseCard,
    setCode,
    poolType,
    poolName: currentPoolName,
    ownerUsername: poolOwnerUsername,
    shareId,
    rootShareId,
  })

  // Export deck as image (deck-only view) — shows it in the modal.
  const exportDeckImage = async (): Promise<void> => {
    setErrorMessage('Generating image...')
    setMessageType('success')
    const deckData = buildDeckData()
    const blob = await renderPoolImageBlob({ ...imageParams(), showSideboard: false })
    if (blob) {
      setDeckImageModal(URL.createObjectURL(blob))
      setErrorMessage('Image generated!')
      setMessageType('success')
      setTimeout(() => {
        setErrorMessage(null)
        setMessageType(null)
      }, 3000)
      trackEvent(AnalyticsEvents.DECK_IMAGE_GENERATED, {
        set_code: setCode,
        pool_type: poolType,
        deck_size: deckData.deck.reduce((sum, c) => sum + c.count, 0),
        sideboard_size: deckData.sideboard.reduce((sum, c) => sum + c.count, 0),
      })
    } else {
      setErrorMessage('Failed to generate image')
      setMessageType('error')
      setTimeout(() => {
        setErrorMessage(null)
        setMessageType(null)
      }, 3000)
    }
  }

  // Export pool image (deck + sideboard/pool column) — returns a blob URL for the modal.
  const exportPoolImage = async (): Promise<string | null> => {
    const blob = await renderPoolImageBlob({ ...imageParams(), showSideboard: true })
    if (!blob) return null
    const deckData = buildDeckData()
    trackEvent(AnalyticsEvents.POOL_IMAGE_GENERATED, {
      set_code: setCode,
      pool_type: poolType,
      deck_size: deckData.deck.reduce((sum, c) => sum + c.count, 0),
      pool_size: deckData.sideboard.reduce((sum, c) => sum + c.count, 0),
    })
    return URL.createObjectURL(blob)
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
