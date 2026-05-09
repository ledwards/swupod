// @ts-nocheck
/**
 * Eval data capture — pair the photos a user uploaded with the data they
 * confirmed at Step 3. Lets us turn real submissions into golden fixtures
 * for `scripts/eval-anomalies.ts`.
 *
 * Storage layout (object key OR local file path):
 *
 *   eval-captures/<sessionId>/
 *     photo-1.jpg              ← raw bytes from the wizard upload
 *     photo-2.jpg              ← (or .png/.heic if that's what was uploaded)
 *     extracted.json           ← Opus's raw extraction result
 *     ground-truth.json        ← user's final corrections from Step 3 submit
 *
 * Backend selection:
 *   - If R2 env vars are set (R2_ACCOUNT_ID + R2_ACCESS_KEY_ID +
 *     R2_SECRET_ACCESS_KEY), uploads go to Cloudflare R2 — durable.
 *   - Otherwise, falls back to /tmp/eval-captures/<sessionId>/ on the
 *     local filesystem (ephemeral on Railway).
 *
 * sessionId is generated on extract and threaded through to create so both
 * sides write to the same prefix.
 */

import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { isR2Configured, r2Put, r2BucketName } from './r2'

const LOCAL_ROOT = '/tmp/eval-captures'
const R2_PREFIX = 'eval-captures'

/** Generate a short, sortable session id: <isoSeconds>-<rand>. */
export function newSessionId(userId?: string | number): string {
  const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) // 2026-05-08T15-30-12
  const rand = randomBytes(3).toString('hex')
  const u = userId ? String(userId).slice(0, 8) : 'anon'
  return `${now}_${u}_${rand}`
}

async function putObject(sessionId: string, name: string, body: Buffer | string, contentType: string) {
  if (isR2Configured()) {
    try {
      await r2Put(`${R2_PREFIX}/${sessionId}/${name}`, body, contentType)
      return
    } catch (err) {
      console.warn(`[evalCapture] R2 put failed for ${name}, falling back to local:`, err)
      // fall through to local
    }
  }
  // Local fallback (ephemeral on Railway, fine for dev/prototype).
  try {
    const dir = join(LOCAL_ROOT, sessionId)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, name), body)
  } catch (err) {
    console.warn(`[evalCapture] local fallback put failed for ${name}:`, err)
  }
}

export async function saveExtractCapture(
  sessionId: string,
  photos: Array<{ data: string; mediaType: string }>,
  extractedResult: any,
): Promise<void> {
  // Fire-and-forget — never block the API response on capture writes.
  const tasks: Promise<void>[] = []
  photos.forEach((p, i) => {
    const ext = (p.mediaType.split('/')[1] || 'bin').replace(/\W/g, '')
    const buf = Buffer.from(p.data, 'base64')
    tasks.push(putObject(sessionId, `photo-${i + 1}.${ext}`, buf, p.mediaType))
  })
  tasks.push(
    putObject(sessionId, 'extracted.json', JSON.stringify(extractedResult, null, 2), 'application/json'),
  )
  // Don't await individually; let caller decide. We Promise.all-after-return.
  Promise.allSettled(tasks).then((results) => {
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed > 0) {
      console.warn(`[evalCapture] ${failed}/${results.length} extract-capture tasks failed for ${sessionId}`)
    }
  })
}

export async function saveCreateCapture(
  sessionId: string,
  groundTruth: { meta: Record<string, unknown>; rows: Array<{ name: string; subtitle: string | null; type: string; poolQty: number; deckQty: number }> },
): Promise<void> {
  const body = JSON.stringify(groundTruth, null, 2)
  // Fire-and-forget here too; failures get logged.
  putObject(sessionId, 'ground-truth.json', body, 'application/json').catch((err) => {
    console.warn(`[evalCapture] saveCreateCapture failed for ${sessionId}:`, err)
  })
}

/** Where captures live, for log messages / docs. */
export function captureBackend(): string {
  return isR2Configured() ? `R2://${r2BucketName()}/${R2_PREFIX}` : LOCAL_ROOT
}
