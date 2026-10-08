// @ts-nocheck
// POST /api/pools/:shareId/claim - Claim an anonymous pool
import { claimAnonymousPool } from '@/lib/claimPool'
import { PtpPlayError } from '@/src/services/play/playState'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const session = requireAuth(request)

    return jsonResponse(await claimAnonymousPool(shareId,session.id))
  } catch (error) {
    if(error instanceof PtpPlayError)return errorResponse(error.message,error.status)
    return handleApiError(error)
  }
}
