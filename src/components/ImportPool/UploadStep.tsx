// @ts-nocheck
'use client'

import { useRef } from 'react'
import Button from '../Button'
import type { useImportPool } from '../../hooks/useImportPool'

interface Props {
  importPool: ReturnType<typeof useImportPool>
}

/**
 * UploadStep — Step 1 of the Import Pool wizard (U7).
 *
 * Mobile-first. <input capture="environment"> opens the camera on mobile and
 * the file picker on desktop. Up to 2 images. "Extract Pool" runs CV.
 */
export default function UploadStep({ importPool }: Props) {
  const { state, addImage, removeImage, runExtraction } = importPool
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isExtracting = state.phase === 'extracting'

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    for (const file of files) {
      if (state.images.length >= 2) break
      await addImage(file)
    }
    // Reset input so the same file can be picked again after removal
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const error = state.error

  return (
    <section className="import-pool-step import-pool-step--upload">
      <h2>Upload your registration sheet</h2>
      <p className="import-pool-help">
        Take a clear, well-lit photo of your registered competitive sealed pool sheet.
        You can upload up to 2 photos if it spans multiple pages. Your photos are sent to
        Anthropic's Claude vision API for OCR and are <strong>not stored</strong> on our servers.
      </p>

      <div className="import-pool-image-grid">
        {state.images.map((img, i) => (
          <figure key={img.previewUrl} className="import-pool-image-card">
            <img src={img.previewUrl} alt={`Sheet ${i + 1}`} />
            <figcaption>
              <span>
                {img.width}×{img.height} · {Math.round(img.sizeBytes / 1024)} KB
              </span>
              <Button variant="danger" size="xs" onClick={() => removeImage(i)} disabled={isExtracting}>
                Remove
              </Button>
            </figcaption>
          </figure>
        ))}

        {state.images.length < 2 && (
          <label className="import-pool-image-card import-pool-image-card--add">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              capture="environment"
              multiple={state.images.length === 0}
              onChange={handleFileChange}
              disabled={isExtracting}
              hidden
            />
            <span className="import-pool-image-card__plus">+</span>
            <span>{state.images.length === 0 ? 'Add photo' : 'Add another'}</span>
          </label>
        )}
      </div>

      {error && (
        <div className="import-pool-error" role="alert">
          <strong>Couldn't extract:</strong> {error.message}
          {error.code === 'SET_DETECTION_FAILED' && (
            <span> The set name on the sheet didn't match a known set. Manual set picker coming in a future update.</span>
          )}
        </div>
      )}

      <div className="import-pool-actions">
        <Button
          variant="primary"
          onClick={runExtraction}
          disabled={state.images.length === 0 || isExtracting}
        >
          {isExtracting ? 'Reading sheet…' : 'Extract Pool'}
        </Button>
      </div>
    </section>
  )
}
