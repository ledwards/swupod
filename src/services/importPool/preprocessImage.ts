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

export async function preprocessImageForExtraction(buffer: Buffer): Promise<Buffer> {
  return await sharp(buffer)
    // Cap dimension — Anthropic downsamples above this anyway, so saving
    // bytes here costs nothing.
    .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
    // Normalise: stretch the histogram so darkest pixel maps to 0 and
    // brightest to 255. Compensates for under-exposed phone photos.
    .normalise()
    // Linear (1.3, -30): contrast multiply with negative offset. Makes
    // dark marks darker against a bright sheet.
    .linear(1.3, -30)
    // Sharpen sigma=1.0: edge-enhance to make tally marks pop.
    .sharpen({ sigma: 1.0 })
    .jpeg({ quality: 95 })
    .toBuffer()
}
