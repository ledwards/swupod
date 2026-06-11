// GET /api/auth/signin/discord - Initiate Discord OAuth flow
import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, sanitizeReturnTo } from '@/lib/auth'

export const OAUTH_STATE_COOKIE = 'swupod_oauth_state'
const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60 // 10 minutes

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID
const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    if (!DISCORD_CLIENT_ID) {
      return NextResponse.json({
        success: false,
        data: null,
        message: 'Discord OAuth not configured',
      }, { status: 500 })
    }

    // Get return_to parameter from query string. Sanitized to an app-local
    // path — protocol-relative (`//evil.com`) and absolute URLs collapse to
    // '/' (open-redirect hardening, U4).
    const { searchParams } = new URL(request.url)
    const returnTo = sanitizeReturnTo(searchParams.get('return_to') || '/')

    // Check if user already has a valid session
    const session = getSession(request)
    if (session) {
      // Already logged in, redirect back to return_to
      return NextResponse.redirect(`${APP_URL}${returnTo}?auth=already_logged_in`)
    }

    // CSRF protection (double-submit cookie, U4): a crypto-random nonce is
    // stored in a short-lived httpOnly cookie AND embedded in the OAuth
    // state. The callback requires both to match before any token exchange.
    const nonce = randomBytes(16).toString('hex')
    const stateData = {
      nonce,
      returnTo,
    }
    const state = Buffer.from(JSON.stringify(stateData)).toString('base64')

    // Build Discord OAuth URL
    const discordAuthUrl = new URL('https://discord.com/api/oauth2/authorize')
    discordAuthUrl.searchParams.set('client_id', DISCORD_CLIENT_ID)
    discordAuthUrl.searchParams.set('redirect_uri', `${APP_URL}/api/auth/callback/discord`)
    discordAuthUrl.searchParams.set('response_type', 'code')
    discordAuthUrl.searchParams.set('scope', 'identify email')
    discordAuthUrl.searchParams.set('state', state)
    // Add prompt=consent to force re-authorization, or remove it to allow auto-approval
    // If user has already authorized, Discord will auto-approve if prompt is not set

    // Redirect to Discord OAuth, carrying the state cookie
    const response = NextResponse.redirect(discordAuthUrl.toString())
    response.cookies.set(OAUTH_STATE_COOKIE, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
    })
    return response
  } catch (error) {
    console.error('Discord signin error:', error)
    return NextResponse.json({
      success: false,
      data: null,
      message: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 })
  }
}
