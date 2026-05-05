// @ts-nocheck
/**
 * Client-side image preprocessing for the Import Pool wizard (U5).
 *
 * Browser-only. Uses <canvas> + URL.createObjectURL + Image to downsample
 * camera photos before posting them to /api/import-pool/extract. Mobile
 * photos are commonly 5-10MB; downsampling to ~2048px wide cuts payload
 * ~5x without hurting CV legibility.
 *
 * See docs/plans/2026-05-05-001-feat-import-pool-spike-plan.md U5.
 */

const VALID_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export interface ProcessedImage {
  /** Base64 string (no data URL prefix) — what the API expects */
  data: string
  /** Output MIME type — JPEG output for photo content */
  mediaType: 'image/jpeg'
  /** Resized image width */
  width: number
  /** Resized image height */
  height: number
  /** Approximate output size in bytes */
  sizeBytes: number
  /** Object URL for in-browser preview (caller must revokeObjectURL on cleanup) */
  previewUrl: string
}

interface ResizeOptions {
  maxWidth?: number
  maxHeight?: number
  /** JPEG quality 0-1 */
  quality?: number
}

const DEFAULT_OPTS: Required<ResizeOptions> = {
  maxWidth: 2048,
  maxHeight: 2048,
  quality: 0.85,
}

export async function resizeImage(
  file: File,
  opts: ResizeOptions = {},
): Promise<ProcessedImage> {
  if (!VALID_MIMES.has(file.type)) {
    throw new Error(
      `Unsupported file type "${file.type}". Allowed: ${[...VALID_MIMES].join(', ')}`,
    )
  }

  const merged = { ...DEFAULT_OPTS, ...opts }
  const previewUrl = URL.createObjectURL(file)

  try {
    const img = await loadImage(previewUrl)
    const { width, height } = scaleToFit(img.width, img.height, merged.maxWidth, merged.maxHeight)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to acquire 2D canvas context')
    ctx.drawImage(img, 0, 0, width, height)

    const dataUrl = canvas.toDataURL('image/jpeg', merged.quality)
    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '')
    const sizeBytes = Math.ceil((base64.length * 3) / 4)

    return {
      data: base64,
      mediaType: 'image/jpeg',
      width,
      height,
      sizeBytes,
      previewUrl,
    }
  } catch (err) {
    URL.revokeObjectURL(previewUrl)
    throw err
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}

function scaleToFit(srcW: number, srcH: number, maxW: number, maxH: number) {
  if (srcW <= maxW && srcH <= maxH) return { width: srcW, height: srcH }
  const ratio = Math.min(maxW / srcW, maxH / srcH)
  return { width: Math.round(srcW * ratio), height: Math.round(srcH * ratio) }
}
