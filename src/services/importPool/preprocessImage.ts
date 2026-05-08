// @ts-nocheck
/**
 * Server-side image preprocessing for Import Pool extraction.
 *
 * Applied inside extractPoolFromImages before bytes go to Claude. Lives
 * server-side so the same pipeline runs in:
 *   - production (route handler invokes extractPoolFromImages)
 *   - eval harness (scripts/eval/run-eval.ts invokes extractPoolFromImages)
 *
 * Earlier this lived in the browser via a canvas filter
 * (contrast(1.3) brightness(0.92)). That works but wasn't strong enough on
 * faint pencil tally marks — the loop plateaued at ~87/96. Moving to sharp
 * with normalise + linear + sharpen converges to 96/96 on the same photos.
 *
 * The browser side now only resizes for upload size; this function does
 * the contrast/sharpen work that actually makes tally marks legible to
 * the vision model.
 */

import sharp from 'sharp'

const MAX_DIM = 2576 // Opus 4.7's high-res vision ceiling

/**
 * Auto-orient a buffer so the sheet ends up PORTRAIT (taller than wide).
 *
 * Step 1: apply any EXIF orientation tag (covers most phone photos —
 * raw pixels are landscape, tag says "rotate 90° to display").
 *
 * Step 2: if the image is *still* landscape after EXIF (which means
 * EXIF was missing/wrong/stripped), rotate 90° CW. Sealed registration
 * sheets are always printed portrait, so a landscape image after EXIF
 * almost certainly indicates the sheet is sideways in the pixels.
 */
export async function autoOrientToPortrait(buffer: Buffer): Promise<Buffer> {
  // EXIF rotate (no-op if no orientation tag).
  const exifRotated = await sharp(buffer).rotate().toBuffer()
  const meta = await sharp(exifRotated).metadata()
  const w = meta.width || 0
  const h = meta.height || 0
  if (w === 0 || h === 0) return exifRotated
  if (w > h) {
    // Still landscape — rotate 90° CW to portrait. We pick CW arbitrarily;
    // for the rare case where the sheet is rotated the OTHER way, accuracy
    // will tank and the user can rotate the source photo before
    // re-uploading.
    return await sharp(exifRotated).rotate(90).toBuffer()
  }
  return exifRotated
}

export async function preprocessImageForExtraction(buffer: Buffer): Promise<Buffer> {
  // Step 1: orient to portrait. Phase 1's bbox coords come out relative
  // to the oriented image, so all subsequent crops use the same oriented
  // bytes via cropOriginalAndPreprocess(autoOrientToPortrait(original)).
  const oriented = await autoOrientToPortrait(buffer)
  return await sharp(oriented)
    // Cap dimension — Anthropic downsamples above this anyway, so saving
    // bytes here costs nothing.
    .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
    // Sharpen sigma=1.0: edge-enhance to make tally marks pop.
    //
    // No normalise() / linear() here. Earlier I had .normalise().linear(1.3,-30)
    // in this pipeline, but on photos with uneven brightness (sheet edge in
    // shadow, lighting gradient), normalise() stretches the histogram against
    // the dark area and faint pencil marks get mapped to nearly-white. Pure
    // sharpen is robust across both well-lit and high-resolution casual photos.
    .sharpen({ sigma: 1.0 })
    .jpeg({ quality: 95 })
    .toBuffer()
}
