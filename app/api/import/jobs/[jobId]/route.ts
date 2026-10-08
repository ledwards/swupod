import type { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { jsonResponse } from '@/lib/utils'
import { findImport, publicJobResponse } from '@/lib/importJobs'

export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest, context: { params: Promise<{ jobId: string }> }): Promise<Response> {
  const session = getSession(request)
  const headers = { 'Cache-Control': 'private, no-store' }
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401, headers })
  const { jobId } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    return Response.json({ error: 'Not found' }, { status: 404, headers })
  }
  const job = await findImport(jobId, session.id)
  if (!job) {
    const response = jsonResponse({ error: 'Not found' }, 404)
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  }
  return publicJobResponse(job)
}
