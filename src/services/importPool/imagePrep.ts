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
  /** Base64 string of the ORIGINAL file bytes (no data URL prefix) */
  data: string
  /** MIME type — preserves the original */
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
  /** Image width in pixels (for UI display) */
  width: number
  /** Image height in pixels (for UI display) */
  height: number
  /** Original file size in bytes */
  sizeBytes: number
  /** Object URL for in-browser preview (caller must revokeObjectURL on cleanup) */
  previewUrl: string
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
  // HEIC handling: iPhone's default photo format. Browser-side canvas
  // can't decode HEIC for our preview pipeline, AND Claude expects
  // JPEG/PNG/WEBP/GIF. Convert client-side via heic2any (lazy-loaded
  // ~600KB chunk only when an HEIC file is actually picked).
  if (HEIC_MIMES.has(file.type) || HEIC_EXT.test(file.name)) {
    const heic2any = (await import('heic2any')).default
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 })
    const blob = Array.isArray(converted) ? converted[0] : (converted as Blob)
    file = new File([blob], file.name.replace(HEIC_EXT, '.jpg'), { type: 'image/jpeg' })
  }

  if (!VALID_MIMES.has(file.type)) {
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
