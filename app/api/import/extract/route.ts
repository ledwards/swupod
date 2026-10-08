import type { NextRequest } from 'next/server'
import { submitImport } from '@/lib/importJobRoute'

export const dynamic = 'force-dynamic'
export async function POST(request: NextRequest): Promise<Response> {
  return submitImport(request, 'extract')
}
