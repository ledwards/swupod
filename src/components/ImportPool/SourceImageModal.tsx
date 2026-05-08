// @ts-nocheck
'use client'

import { useEffect, useMemo, useState } from 'react'
import Button from '../Button'
import type { ProcessedImage } from '../../services/importPool/imagePrep'
import type { SectionBounds } from '../../hooks/useImportPool'

interface Props {
  images: ProcessedImage[]
  onClose: () => void
  /** When set, the modal opens cropped to this section's bounds across all
   *  photos that contain it. User can toggle back to the full sheet. */
  sectionFilter?: string | null
  sectionBounds?: SectionBounds[]
}

/**
 * SourceImageModal — view the original sheet images at full size so the user
 * can verify the import against the source.
 *
 * Pinch-to-zoom on touch devices works natively. On desktop, scroll-wheel +
 * cmd/ctrl zooms via the browser; we also add a tap-to-zoom toggle that
 * doubles the rendered size.
 *
 * When a sectionFilter is provided AND we have bounds for that section, the
 * modal opens cropped to just that section. The user can flip back to the
 * full sheet via the toggle in the header.
 */
export default function SourceImageModal({
  images,
  onClose,
  sectionFilter = null,
  sectionBounds = [],
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [zoomed, setZoomed] = useState(false)
  // When opened with a section filter, default to "show only that section";
  // toggle button lets the user pop out to the full sheet.
  const [showFullSheet, setShowFullSheet] = useState(false)

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

  // Filter to the bounds entries for this section, sorted by photo order.
  // A section can span multiple photos (e.g. Multicolor continues onto photo 2).
  const sectionEntries = useMemo(() => {
    if (!sectionFilter) return []
    return sectionBounds
      .filter((b) => b.name === sectionFilter)
      .sort((a, b) => a.photoIndex - b.photoIndex)
  }, [sectionFilter, sectionBounds])

  // If we were asked to crop but Claude didn't return bounds for this
  // section, fall through to the full-sheet view rather than showing nothing.
  const haveCrop = sectionEntries.length > 0
  const cropping = !!sectionFilter && haveCrop && !showFullSheet

  // For the full-sheet view, navigate by photo tab. For the cropped view,
  // ALL matching crops render in the modal so the user can scan all the
  // section's content at once (rare to have a section span both photos but
  // we handle it).
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
          <h3>
            {cropping ? `Source · ${sectionFilter} section` : 'Source sheet'}
          </h3>
          <div className="ip-source-modal__actions">
            {!cropping && images.length > 1 && (
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
            {sectionFilter && haveCrop && (
              <Button
                variant="secondary"
                size="xs"
                onClick={() => setShowFullSheet((v) => !v)}
                title={showFullSheet ? 'Show only this section' : 'Show the entire sheet'}
              >
                {showFullSheet ? 'Crop' : 'Full sheet'}
              </Button>
            )}
            <Button variant="secondary" size="xs" onClick={() => setZoomed((z) => !z)}>
              {zoomed ? 'Fit' : 'Zoom'}
            </Button>
            <Button variant="icon" size="sm" onClick={onClose} aria-label="Close">
              ×
            </Button>
          </div>
        </header>

        <div
          className={`ip-source-modal__viewport ${zoomed ? 'is-zoomed' : ''}`}
          onClick={() => setZoomed((z) => !z)}
        >
          {images.length === 0 ? (
            <div className="ip-source-modal__empty">
              <p>
                Source images aren&apos;t loaded for this session. They were dropped from
                local storage to save space — re-upload them to see the original sheet
                here.
              </p>
            </div>
          ) : cropping ? (
            <div className="ip-source-modal__crops">
              {sectionEntries.map((b, i) => {
                const photo = images[b.photoIndex]
                if (!photo) return null
                return (
                  <CroppedView
                    key={`${b.name}-${b.photoIndex}-${i}`}
                    src={photo.previewUrl}
                    naturalWidth={photo.width}
                    naturalHeight={photo.height}
                    bounds={b}
                    captionLabel={
                      sectionEntries.length > 1
                        ? `Page ${b.photoIndex + 1} of ${images.length}`
                        : null
                    }
                  />
                )
              })}
            </div>
          ) : (
            active && (
              <img
                src={active.previewUrl}
                alt={`Source sheet ${activeIndex + 1}`}
                className="ip-source-modal__img"
              />
            )
          )}
        </div>
        {cropping && !haveCrop && (
          <div className="ip-source-modal__hint">
            We don&apos;t have bounds for this section yet — showing the full sheet.
          </div>
        )}
      </div>
    </div>
  )
}

/** Renders a region of an image cropped to normalized [0,1] bounds. We use a
 *  fixed-aspect-ratio container clipping a positioned <img> rather than a
 *  canvas crop so the original photo's natural resolution is preserved (no
 *  re-encoding) and so the browser handles decoding/scaling. */
function CroppedView({
  src,
  naturalWidth,
  naturalHeight,
  bounds,
  captionLabel,
}: {
  src: string
  naturalWidth: number
  naturalHeight: number
  bounds: SectionBounds
  captionLabel: string | null
}) {
  const dx = Math.max(0.001, bounds.x1 - bounds.x0)
  const dy = Math.max(0.001, bounds.y1 - bounds.y0)
  // Section's own aspect ratio = (cropped width in px) / (cropped height in px)
  const sectionAspect = (dx * naturalWidth) / (dy * naturalHeight)

  return (
    <div className="ip-source-crop">
      {captionLabel && <div className="ip-source-crop__caption">{captionLabel}</div>}
      <div
        className="ip-source-crop__viewport"
        style={{ aspectRatio: `${sectionAspect}` }}
      >
        <img
          src={src}
          alt=""
          style={{
            position: 'absolute',
            // Position the image so the section's top-left lands at
            // container (0, 0) and the section's width fills the container.
            left: `${(-bounds.x0 * 100) / dx}%`,
            top: `${(-bounds.y0 * 100) / dy}%`,
            width: `${100 / dx}%`,
            height: 'auto',
            maxWidth: 'none',
            display: 'block',
          }}
        />
      </div>
    </div>
  )
}
