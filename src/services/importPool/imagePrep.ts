// @ts-nocheck
/**
 * Client-side image PASS-THROUGH for the Import Pool wizard.
 *
 * Browser-only. Reads the user-selected file as base64 WITHOUT
 * re-encoding, so the server receives the original camera bytes.
 *
 * Why no client-side resize/re-encode:
 *   - The browser's `canvas.toDataURL('image/jpeg', q)` is much lossier
 *     than sharp at the same nominal quality. We measured ~6 percentage
 *     points of OMR accuracy lost on a fixture upload vs the same bytes
 *     read from disk.
 *   - The server already runs the same sharp-based downsample +
 *     sharpen pipeline (`preprocessImage.ts:preprocessImageForExtraction`)
 *     before sending bytes to Claude, so any size reduction we do here
 *     is duplicate work AT WORSE FIDELITY.
 *   - Quality > upload size: even a 24MP iPhone photo is ~7MB, and we
 *     have plenty of headroom on Railway. Trading bandwidth for accuracy
 *     is the right call for a low-volume patron-only feature.
 */

const VALID_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
// iPhone's "High Efficiency" capture format. Browser canvas can't decode
// HEIC natively (Safari included for non-image-tag use), so we convert to
// JPEG client-side via heic2any (lazy-loaded only when needed).
const HEIC_MIMES = new Set(['image/heic', 'image/heif'])
const HEIC_EXT = /\.(heic|heif)$/i

export interface ProcessedImage {
  /** Base64 string of the ORIGINAL file bytes (no data URL prefix). Kept
   *  for legacy fallback to the inline-images extract path; the preferred
   *  path is photoKey via the upload-photo endpoint. */
  data: string
  /** MIME type — preserves the original */
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'image/heic' | 'image/heif'
  /** Image width in pixels (for UI display) */
  width: number
  /** Image height in pixels (for UI display) */
  height: number
  /** Original file size in bytes */
  sizeBytes: number
  /** Object URL for in-browser preview (caller must revokeObjectURL on cleanup) */
  previewUrl: string
  /** R2 (or /tmp) key returned by /api/import/upload-photo. When present,
   *  /api/import/extract will fetch the photo by key instead of via the
   *  inline base64 image array — sidestepping Next.js's ~10MB JSON cap. */
  photoKey?: string
  /** Original filename from the file picker (e.g. "IMG_4521.heic"). Surfaced
   *  in the upload UI so a user can tell at a glance whether the picker handed
   *  back the same file twice — iPhone HEICs have unique IMG_NNNN names per
   *  capture, so two thumbnails with the same name = same photo. */
  fileName?: string
}

interface ResizeOptions {
  // Kept for API compatibility — ignored. Server handles resize.
  maxWidth?: number
  maxHeight?: number
  quality?: number
}

export async function resizeImage(
  file: File,
  _opts: ResizeOptions = {},
): Promise<ProcessedImage> {
  // HEIC files: pass through to the server, which converts via sharp +
  // libheif (handles more variants than client-side heic2any, which was
  // throwing ERR_LIBHEIF format not supported on some iPhone HEIFs).
  // For preview rendering: HEIC can't render in <img>, so we strip the
  // preview later (UI handles the fallback).
  const isHeic = HEIC_MIMES.has(file.type) || HEIC_EXT.test(file.name)

  if (!isHeic && !VALID_MIMES.has(file.type)) {
    throw new Error(
      `Unsupported file type "${file.type}". Allowed: ${[...VALID_MIMES, ...HEIC_MIMES].join(', ')}`,
    )
  }

  // Read original file bytes as base64 — no re-encoding.
  const arrayBuffer = await file.arrayBuffer()
  const data = arrayBufferToBase64(arrayBuffer)

  // previewUrl as a DATA URL (not blob URL) so it survives serialization
  // to IndexedDB across page refreshes. Same bytes as `data`, just in
  // URL form — costs no extra memory beyond the base64 string itself.
  const previewUrl = `data:${file.type};base64,${data}`

  // Get image dimensions for UI display.
  let width = 0
  let height = 0
  try {
    const img = await loadImage(previewUrl)
    width = img.naturalWidth || img.width
    height = img.naturalHeight || img.height
  } catch {
    // Best-effort — UI can still render preview without dims
  }

  return {
    data,
    mediaType: file.type as ProcessedImage['mediaType'],
    width,
    height,
    sizeBytes: file.size,
    previewUrl,
    fileName: file.name,
  }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  // Avoid building a giant string in one go — chunk the conversion to
  // stay under V8 string-length limits and keep the main thread responsive.
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunkSize = 0x8000 // 32KB chunks
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode.apply(null, chunk as unknown as number[])
  }
  return btoa(binary)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}
