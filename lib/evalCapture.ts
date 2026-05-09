// @ts-nocheck
/**
 * Eval data capture — pair the photos a user uploaded with the data they
 * confirmed at Step 3. Lets us turn real submissions into golden fixtures
 * for `scripts/eval-anomalies.ts`.
 *
 * Storage layout:
 *
 *   /tmp/eval-captures/<sessionId>/
 *     photo-1.jpg              ← raw bytes from the wizard upload
 *     photo-2.jpg              ← (or .png/.heic if that's what was uploaded)
 *     extracted.json           ← Opus's raw extraction result
 *     ground-truth.json        ← user's final corrections from Step 3 submit
 *
 * sessionId is generated on extract and threaded through to create so both
 * sides write to the same directory.
 *
 * `/tmp` is ephemeral on Railway — fine for "I'll grab them every few days"
 * collection. Move to R2 when persistence matters.
 */

import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'

const ROOT = '/tmp/eval-captures'

/** Generate a short, sortable session id: <isoSeconds>-<rand>. */
export function newSessionId(userId?: string | number): string {
  const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) // 2026-05-08T15-30-12
  const rand = randomBytes(3).toString('hex')
  const u = userId ? String(userId).slice(0, 8) : 'anon'
  return `${now}_${u}_${rand}`
}

export function saveExtractCapture(
  sessionId: string,
  photos: Array<{ data: string; mediaType: string }>,
  extractedResult: any,
): void {
  try {
    const dir = join(ROOT, sessionId)
    mkdirSync(dir, { recursive: true })
    photos.forEach((p, i) => {
      const ext = (p.mediaType.split('/')[1] || 'bin').replace(/\W/g, '')
      const buf = Buffer.from(p.data, 'base64')
      writeFileSync(join(dir, `photo-${i + 1}.${ext}`), buf)
    })
    writeFileSync(join(dir, 'extracted.json'), JSON.stringify(extractedResult, null, 2))
  } catch (err) {
    console.warn('[evalCapture] saveExtractCapture failed:', err)
  }
}

export function saveCreateCapture(
  sessionId: string,
  groundTruth: { meta: Record<string, unknown>; rows: Array<{ name: string; subtitle: string | null; type: string; poolQty: number; deckQty: number }> },
): void {
  try {
    const dir = join(ROOT, sessionId)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'ground-truth.json'), JSON.stringify(groundTruth, null, 2))
  } catch (err) {
    console.warn('[evalCapture] saveCreateCapture failed:', err)
  }
}
