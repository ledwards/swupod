import { createHash } from 'node:crypto'
import { query, queryRow, withAdvisoryLock } from './db'
import { jsonResponse } from './utils'
import { getAllSetCodes } from '../src/utils/setConfigs/index'
import { TABLE_NAMES } from '../src/services/importPool/tableGrouping'

export type ImportKind = 'extract' | 'section'
export type ImportInput = Record<string, unknown>
export interface ImportJob {
  id: string
  user_id: string
  kind: ImportKind
  input: ImportInput
  attempt_token: string
}

export function validateImportInput(kind: ImportKind, value: unknown, userId: string): ImportInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid import request')
  const body = value as ImportInput
  const input: ImportInput = {}
  if (Array.isArray(body.photoKeys) && body.photoKeys.length) {
    if (body.photoKeys.length > 2 || body.photoKeys.some(key =>
      typeof key !== 'string' || !key.startsWith(`import-uploads/${userId}/`) ||
      !/^[a-zA-Z0-9/_\-.]+$/.test(key) || key.includes('..') || key.length > 250
    )) throw new Error('Invalid or unowned source photos')
    input.photoKeys = body.photoKeys
  } else if (kind === 'extract' && Array.isArray(body.images) && body.images.length && body.images.length <= 2) {
    let bytes = 0
    input.images = body.images.map(image => {
      if (!image || typeof image.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(image.data) ||
        !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(image.mediaType)) throw new Error('Invalid source image')
      bytes += Math.ceil(image.data.length * 3 / 4)
      return { data: image.data, mediaType: image.mediaType }
    })
    if (!bytes || bytes > 30 * 1024 * 1024) throw new Error('Source images exceed upload limit')
  } else throw new Error('Source photos required')
  if (body.manualSetCode !== undefined) {
    if (typeof body.manualSetCode !== 'string' || !getAllSetCodes().includes(body.manualSetCode)) throw new Error('Unknown set')
    input.manualSetCode = body.manualSetCode
  }
  if (kind === 'section') {
    if (typeof body.sectionName !== 'string' || !(TABLE_NAMES as readonly string[]).includes(body.sectionName) ||
      typeof body.setCode !== 'string' || !getAllSetCodes().includes(body.setCode)) throw new Error('Invalid section or set')
    input.sectionName = body.sectionName
    input.setCode = body.setCode
  }
  return input
}

export async function enqueueImport(userId: string, kind: ImportKind, input: ImportInput, readRow = queryRow) {
  const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
  // An HTTP retry or second tab reuses an active job, avoiding duplicate model charges.
  return readRow(`INSERT INTO import_jobs (user_id, kind, request_hash, input)
    VALUES ($1, $2, $3, $4::jsonb)
    ON CONFLICT (user_id, kind, request_hash) WHERE status IN ('queued', 'running')
    DO UPDATE SET request_hash = EXCLUDED.request_hash
    RETURNING id, status`, [userId, kind, hash, JSON.stringify(input)])
}

export function publicJobResponse(job: Record<string, unknown>): Response {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' }
  if (job.status === 'succeeded' || job.status === 'failed') {
    return new Response(JSON.stringify(job.result), { status: Number(job.http_status), headers })
  }
  const response = jsonResponse({ jobId: job.id, status: job.status }, 202)
  response.headers.set('Cache-Control', headers['Cache-Control'])
  response.headers.set('Retry-After', '3')
  response.headers.set('Location', `/api/import/jobs/${job.id}`)
  return response
}

interface WorkerDependencies {
  execute: (job: ImportJob) => Promise<Response>
  finish: (id: string, token: string, status: number, result: unknown) => Promise<void>
}

export async function runImportJob(job: ImportJob, deps: WorkerDependencies): Promise<void> {
  let status: number
  let result: unknown
  try {
    const response = await deps.execute(job)
    status = response.status
    result = await response.json()
  } catch {
    status = 500
    result = { success: false, data: { code: 'EXTRACTION_FAILED', error: 'Extraction failed. Please retry.' } }
  }
  await deps.finish(job.id, job.attempt_token, status, result)
}

async function execute(job: ImportJob): Promise<Response> {
  if (job.kind === 'section') {
    const { extractSection } = await import('./importSection')
    return extractSection(job.input)
  }
  const { extractImport } = await import('./importExtraction')
  return extractImport(job.input, job.user_id)
}

export async function finishImport(id: string, token: string, status: number, result: unknown, write = query): Promise<void> {
  // Fencing prevents a worker that lost its DB connection from overwriting a restarted attempt.
  await write(`UPDATE import_jobs SET status = $3, http_status = $4, result = $5::jsonb,
    input = '{}'::jsonb, updated_at = now() WHERE id = $1 AND attempt_token = $2`,
  [id, token, status < 400 ? 'succeeded' : 'failed', status, JSON.stringify(result)])
}

export async function claimImport(readRow = queryRow): Promise<ImportJob | null> {
  const row = await readRow(`UPDATE import_jobs SET status = 'running', attempts = attempts + 1,
    attempt_token = gen_random_uuid(), updated_at = now() WHERE id = (
      SELECT id FROM import_jobs WHERE status IN ('queued', 'running') ORDER BY created_at LIMIT 1
    ) RETURNING *`)
  return row as unknown as ImportJob | null
}

export async function findImport(id: string, userId: string, readRow = queryRow) {
  return readRow('SELECT id, status, result, http_status FROM import_jobs WHERE id = $1 AND user_id = $2', [id, userId])
}

let busy = false
export async function processImportQueue(): Promise<void> {
  if (busy) return
  busy = true
  try {
    // Existing server pattern: the session lock releases on process death. A replacement
    // worker can immediately resume a running job; no stuck in-memory promises or cookies.
    await withAdvisoryLock('ptp-import-worker', async () => {
      await query(`UPDATE import_jobs SET status = 'failed', http_status = 503,
        result = '{"success":false,"data":{"code":"EXTRACTION_INTERRUPTED","error":"Import was interrupted repeatedly. Please retry."}}',
        input = '{}'::jsonb, updated_at = now() WHERE status = 'running' AND attempts >= 3`)
      const job = await claimImport()
      if (job) await runImportJob(job, { execute, finish: finishImport })
    })
  } finally { busy = false }
}
