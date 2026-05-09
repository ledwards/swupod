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
 * the file picker on desktop. Up to 2 images. "Import Pool" runs CV.
 */
export default function UploadStep({ importPool }: Props) {
  const { state, addImage, removeImage, runExtraction } = importPool
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isExtracting = state.phase === 'extracting'

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Take at most 2 files from the picker, but always process them — the
    // reducer caps state.images at 2 by evicting the oldest, so a new
    // upload is never silently dropped (which used to happen when IDB
    // hydration filled the grid with stale photos before the user picked).
    const files = Array.from(e.target.files || []).slice(0, 2)
    for (const file of files) {
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
        Upload two photos: one for front, one for back.
      </p>

      <div className="import-pool-image-grid">
        {state.images.map((img, i) => {
          // Flag a thumbnail as a duplicate if its byte size matches another
          // loaded thumbnail. iPhone HEIC bytes are unique per capture, so
          // identical sizes = same source file (the photo picker reused it).
          const isDuplicateOfOther = state.images.some(
            (other, j) => j !== i && other.sizeBytes === img.sizeBytes,
          )
          return (
            <figure key={img.previewUrl} className="import-pool-image-card">
              <img src={img.previewUrl} alt={`Sheet ${i + 1}`} />
              <figcaption>
                <span title={img.fileName || ''}>
                  {img.fileName ? `${img.fileName} · ` : ''}
                  {img.width}×{img.height} · {Math.round(img.sizeBytes / 1024)} KB
                </span>
                {isDuplicateOfOther && (
                  <span style={{ color: '#f88', fontSize: '0.85em' }}>
                    Same file as another slot — pick a different photo.
                  </span>
                )}
                <Button variant="danger" size="xs" onClick={() => removeImage(i)} disabled={isExtracting}>
                  Remove
                </Button>
              </figcaption>
            </figure>
          )
        })}

        {state.images.length < 2 && (
          <label className="import-pool-image-card import-pool-image-card--add">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
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
          <strong>Couldn't import:</strong> {error.message}
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
          {isExtracting ? 'Importing…' : 'Import Pool'}
        </Button>
      </div>
    </section>
  )
}
