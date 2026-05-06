// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import Button from '../Button'
import type { ProcessedImage } from '../../services/importPool/imagePrep'

interface Props {
  images: ProcessedImage[]
  onClose: () => void
}

/**
 * SourceImageModal — view the original sheet images at full size so the user
 * can verify Claude's extraction against the source.
 *
 * Pinch-to-zoom on touch devices works natively. On desktop, scroll-wheel +
 * cmd/ctrl zooms via the browser; we also add a tap-to-zoom toggle that
 * doubles the rendered size.
 */
export default function SourceImageModal({ images, onClose }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [zoomed, setZoomed] = useState(false)

  // Lock body scroll
  useEffect(() => {
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [])

  // ESC closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const active = images[activeIndex]

  return (
    <div
      className="ip-source-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="ip-source-modal" onClick={(e) => e.stopPropagation()}>
        <header className="ip-source-modal__header">
          <h3>Source sheet</h3>
          <div className="ip-source-modal__actions">
            {images.length > 1 && (
              <div className="ip-source-modal__tabs">
                {images.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`ip-source-modal__tab ${i === activeIndex ? 'ip-source-modal__tab--active' : ''}`}
                    onClick={() => setActiveIndex(i)}
                  >
                    Page {i + 1}
                  </button>
                ))}
              </div>
            )}
            <Button
              variant="secondary"
              size="xs"
              onClick={() => setZoomed((z) => !z)}
            >
              {zoomed ? 'Fit' : 'Zoom'}
            </Button>
            <Button variant="icon" size="sm" onClick={onClose} aria-label="Close">
              ×
            </Button>
          </div>
        </header>

        <div className={`ip-source-modal__viewport ${zoomed ? 'is-zoomed' : ''}`}>
          {active && (
            <img
              src={active.previewUrl}
              alt={`Source sheet ${activeIndex + 1}`}
              className="ip-source-modal__img"
            />
          )}
        </div>
      </div>
    </div>
  )
}
