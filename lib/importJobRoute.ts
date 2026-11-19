import type { NextRequest } from 'next/server'
import { getSession } from './auth'
import { queryRow } from './db'
import { jsonResponse } from './utils'
import { enqueueImport, publicJobResponse, validateImportInput, type ImportKind } from './importJobs'
import { ImportLimitError } from '../src/services/importPool/importLimits'

export async function submitImport(request: NextRequest, kind: ImportKind): Promise<Response> {
  const session = getSession(request)
  if (!session) return jsonResponse({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
  if (!session.is_admin) {
    const user = await queryRow('SELECT is_patron FROM users WHERE id = $1', [session.id])
    if (!user?.is_patron) return jsonResponse({ error: 'Friends of the Pod required', code: 'PATRON_REQUIRED' }, 403)
  }
  let input
  try { input = validateImportInput(kind, await request.json(), session.id) }
  catch (error) {
    return jsonResponse({ code: 'INVALID_REQUEST', error: error instanceof Error ? error.message : 'Invalid request' }, 400)
  }
  let job
  try { job = await enqueueImport(session.id, kind, input) }
  catch (error) {
    if (!(error instanceof ImportLimitError)) throw error
    const response = jsonResponse({ code: 'IMPORT_LIMIT_REACHED', error: error.message }, 429)
    response.headers.set('Retry-After', '3600')
    return response
  }
  if (!job) throw new Error('Could not enqueue import')
  return publicJobResponse(job)
}
