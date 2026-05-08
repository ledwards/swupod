// @ts-nocheck
/**
 * DeckImageModal Component
 *
 * Modal for displaying and downloading deck export images.
 * Supports toggling between deck view and full pool view.
 */

import { useState, type MouseEvent } from 'react'
import Button from '../Button'
import { formatPoolLabel } from '../../utils/poolDisplayName'

export type PoolType = 'draft' | 'sealed'

export interface DeckImageModalProps {
  imageUrl: string | null
  onClose: () => void
  poolName?: string
  setCode?: string
  poolType?: PoolType
  exportPoolImage?: () => Promise<string | null>
}

export function DeckImageModal({ imageUrl, onClose, poolName, setCode, poolType, exportPoolImage }: DeckImageModalProps) {
  const [showingPool, setShowingPool] = useState(false)
  const [poolImageUrl, setPoolImageUrl] = useState<string | null>(null)
  const [loadingPool, setLoadingPool] = useState(false)

  if (!imageUrl) return null

  const currentImageUrl = showingPool && poolImageUrl ? poolImageUrl : imageUrl

  const handleClose = () => {
    URL.revokeObjectURL(imageUrl)
    if (poolImageUrl) {
      URL.revokeObjectURL(poolImageUrl)
    }
    onClose()
  }

  const handleToggleView = async () => {
    if (showingPool) {
      // Switch back to deck view
      setShowingPool(false)
    } else {
      // Switch to pool view - generate if needed
      if (poolImageUrl) {
        setShowingPool(true)
      } else if (exportPoolImage) {
        setLoadingPool(true)
        const url = await exportPoolImage()
        setLoadingPool(false)
        if (url) {
          setPoolImageUrl(url)
          setShowingPool(true)
        }
      }
    }
  }

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = currentImageUrl

    // Generate filename with pool name and timestamp
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    let hours = now.getHours()
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const ampm = hours >= 12 ? 'PM' : 'AM'
    hours = hours % 12
    hours = hours ? hours : 12
    const timeStr = `${month}${day}_${hours}${minutes}${ampm}`

    const displayName = poolName || formatPoolLabel(setCode, poolType === 'draft' ? 'draft' : 'sealed')
    // Sanitize filename - remove invalid characters
    const sanitizedName = displayName.replace(/[^a-z0-9]/gi, '_').toLowerCase()
    const prefix = poolType === 'draft' ? 'ptp_draft' : 'ptp_sealed'
    const suffix = showingPool ? '_pool' : '_deck'

    a.download = `${prefix}_${sanitizedName}${suffix}_${timeStr}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="deck-image-modal-overlay" onClick={handleClose}>
      <div className="deck-image-modal-content" onClick={(e: MouseEvent) => e.stopPropagation()}>
        <Button
          variant="icon"
          size="sm"
          className="deck-image-modal-close"
          onClick={handleClose}
        >
          ×
        </Button>
        <img
          src={currentImageUrl}
          alt={showingPool ? "Pool Export" : "Deck Export"}
          className="deck-image-modal-image"
        />
        <div className="deck-image-modal-actions">
          <Button
            variant="primary"
            className="deck-image-modal-download"
            onClick={handleDownload}
          >
            Download Image
          </Button>
          {exportPoolImage && (
            <Button
              variant="secondary"
              className="deck-image-modal-toggle"
              onClick={handleToggleView}
              disabled={loadingPool}
            >
              {loadingPool ? 'Loading...' : showingPool ? 'Show Deck' : 'Show Entire Pool'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default DeckImageModal
