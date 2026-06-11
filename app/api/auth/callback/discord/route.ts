// @ts-nocheck
// GET /api/auth/callback/discord - Discord OAuth callback
import { queryRow, query } from '@/lib/db'
import { setSession, sanitizeReturnTo } from '@/lib/auth'
import { OAUTH_STATE_COOKIE } from '../../signin/discord/route'
import { NextRequest, NextResponse } from 'next/server'

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET
const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

interface DiscordUser {
  id: string
  username: string
  email: string
  avatar: string | null
}

interface User {
  id: string
  email: string
  username: string
  avatar_url: string | null
  is_admin: boolean
  is_beta_tester: boolean
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    // Decode state to get the CSRF nonce and return_to URL. returnTo is
    // attacker-influenced (it round-trips through Discord), so it is
    // sanitized to an app-local path (open-redirect hardening, U4).
    let returnTo = '/'
    let stateNonce: string | null = null
    if (state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString())
        returnTo = sanitizeReturnTo(stateData.returnTo || '/')
        stateNonce = typeof stateData.nonce === 'string' ? stateData.nonce : null
      } catch (e) {
        console.error('Failed to decode state:', e)
      }
    }

    if (error) {
      return NextResponse.redirect(`${APP_URL}${returnTo}?error=${encodeURIComponent(error)}`)
    }

    if (!code) {
      return NextResponse.json({
        success: false,
        data: null,
        message: 'Missing authorization code',
      }, { status: 400 })
    }

    // CSRF check (double-submit cookie, U4): the nonce embedded in state must
    // match the httpOnly cookie set by the signin route. Verified BEFORE any
    // token exchange — a forged or replayed callback never reaches Discord.
    const cookieNonce = request.cookies.get(OAUTH_STATE_COOKIE)?.value || null
    if (!stateNonce || !cookieNonce || stateNonce !== cookieNonce) {
      console.error('Discord OAuth state verification failed', {
        hasStateNonce: !!stateNonce,
        hasCookieNonce: !!cookieNonce,
      })
      const response = NextResponse.redirect(`${APP_URL}/?error=invalid_oauth_state`)
      response.cookies.delete(OAUTH_STATE_COOKIE)
      return response
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID!,
        client_secret: DISCORD_CLIENT_SECRET!,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: `${APP_URL}/api/auth/callback/discord`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text()
      console.error('Discord token exchange failed:', tokenResponse.status, errorBody)
      throw new Error(`Failed to exchange code for token: ${tokenResponse.status} ${errorBody}`)
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    // Get user info from Discord
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!userResponse.ok) {
      throw new Error('Failed to fetch user info from Discord')
    }

    const discordUser: DiscordUser = await userResponse.json()

    // Find or create user
    let user: User | null = await queryRow(
      'SELECT * FROM users WHERE discord_id = $1',
      [discordUser.id]
    )

    if (!user) {
      // Create new user
      const result = await query(
        `INSERT INTO users (discord_id, username, email, avatar_url)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          discordUser.id,
          discordUser.username,
          discordUser.email,
          discordUser.avatar
            ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
            : null,
        ]
      )
      user = result.rows[0]
    } else {
      // Update existing user
      const result = await query(
        `UPDATE users
         SET username = $1, email = $2, avatar_url = $3, updated_at = NOW()
         WHERE discord_id = $4
         RETURNING *`,
        [
          discordUser.username,
          discordUser.email,
          discordUser.avatar
            ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
            : null,
          discordUser.id,
        ]
      )
      user = result.rows[0] || user
    }

    // Create session and redirect to return_to. The state cookie is single-use:
    // cleared here so a replayed callback fails the CSRF check.
    const separator = returnTo.includes('?') ? '&' : '?'
    const response = NextResponse.redirect(`${APP_URL}${returnTo}${separator}auth=success`)
    response.cookies.delete(OAUTH_STATE_COOKIE)
    return setSession(response, user!)
  } catch (error) {
    console.error('Discord OAuth error:', error)
    // Try to redirect to return_to from state, fallback to home
    const { searchParams } = new URL(request.url)
    const state = searchParams.get('state')
    let returnTo = '/'
    if (state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString())
        returnTo = sanitizeReturnTo(stateData.returnTo || '/')
      } catch (e) {
        // ignore decode errors
      }
    }
    return NextResponse.redirect(`${APP_URL}${returnTo}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unknown error')}`)
  }
}
