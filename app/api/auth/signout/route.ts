// POST /api/auth/signout - Sign out current user
import { clearSession } from '@/lib/auth'
import { errorResponse } from '@/lib/utils'
import { NextResponse } from 'next/server'

export async function POST(): Promise<Response> {
  try {
    const response = NextResponse.json({
      success: true,
      data: { message: 'Signed out successfully' },
    })
    return clearSession(response)
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500)
  }
}
