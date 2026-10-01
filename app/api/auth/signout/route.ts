import { revokeNativeSubject } from '@/src/services/play/native/reconciliation'
// POST /api/auth/signout - Sign out current user
import { clearSession, getSession } from '@/lib/auth'
import { errorResponse } from '@/lib/utils'
import { NextResponse } from 'next/server'

export async function POST(request: Request): Promise<Response> {
  try {
    const session = getSession(request)
    if (session && request.headers.get('origin') && request.headers.get('origin') !== (process.env.PTP_PUBLIC_ORIGIN ?? `${new URL(request.url).protocol}//${request.headers.get('host') ?? new URL(request.url).host}`)) return errorResponse('Request origin is not allowed', 403)
    if (session) {
      // Clear local login even if the game gateway is temporarily unavailable;
      // persisted revocations retry, and issued game authorization is bounded.
      await revokeNativeSubject(session.id).catch(() => {})
    }
    const response = NextResponse.json({
      success: true,
      data: { message: 'Signed out successfully' },
    })
    return clearSession(response)
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500)
  }
}
