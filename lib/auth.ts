// Authentication utilities
import jwt from 'jsonwebtoken'
import { queryRow } from './db'

// Secret hard-fail (U4, foundations hardening): production must never run on
// the development fallback secret — anyone who reads the source could mint
// admin tokens. Throwing at module init stops the boot (same fail-fast
// philosophy as the startup-migration gate).
const configuredSecret = process.env['JWT_SECRET'] || process.env['NEXTAUTH_SECRET']
if (!configuredSecret && process.env['NODE_ENV'] === 'production') {
  throw new Error(
    'FATAL: JWT_SECRET (or NEXTAUTH_SECRET) must be set in production. ' +
    'Refusing to start with the development fallback secret.'
  )
}
if (!configuredSecret) {
  console.warn('⚠️  JWT_SECRET not set — using the DEVELOPMENT fallback secret. Never deploy like this.')
}
const JWT_SECRET: string = configuredSecret || 'change-me-in-production'
const COOKIE_NAME = 'swupod_session'

export interface User {
  id: string
  /** Discord snowflake — used to form the cross-surface `discord-<id>` analytics identity. */
  discord_id?: string
  email: string
  username: string
  avatar_url?: string | null
  is_admin?: boolean
  is_beta_tester?: boolean
  /** users.auth_version — bumped on privilege grant/revoke to invalidate stale tokens */
  auth_version?: number
}

export interface Session {
  id: string
  /** Discord snowflake — present on tokens minted after the analytics identity change. */
  discord_id?: string
  email: string
  username: string
  avatar_url?: string | null
  is_admin: boolean
  is_beta_tester: boolean
  /** Token-version claim; privileged gates compare it to users.auth_version */
  auth_version?: number
  iat?: number
  exp?: number
}

interface CookieOptions {
  httpOnly: boolean
  secure: boolean
  sameSite: 'lax' | 'strict' | 'none'
  path: string
  maxAge: number
}

interface ResponseWithCookies extends Response {
  cookies?: {
    set: (name: string, value: string, options: CookieOptions) => void
    delete: (name: string) => void
  }
}

/**
 * Create a JWT token for a user
 * @param user - User object with id, email, etc.
 * @returns JWT token
 */
export function createToken(user: User): string {
  return jwt.sign(
    {
      id: user.id,
      discord_id: user.discord_id,
      email: user.email,
      username: user.username,
      avatar_url: user.avatar_url,
      is_admin: user.is_admin || false,
      is_beta_tester: user.is_beta_tester || false,
      auth_version: typeof user.auth_version === 'number' ? user.auth_version : 1,
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  )
}

/**
 * Verify and decode a JWT token
 * @param token - JWT token
 * @returns Decoded token payload or null
 */
export function verifyToken(token: string): Session | null {
  try {
    return jwt.verify(token, JWT_SECRET) as Session
  } catch {
    return null
  }
}

/**
 * Get session from request (for API routes)
 * @param request - HTTP request object
 * @returns Session object or null
 */
export function getSession(request: Request): Session | null {
  // Check Authorization: Bearer header first
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const session = verifyToken(token)
    if (session) return session
  }

  // Fall back to cookie
  const cookieHeader = request.headers.get('cookie')
  if (!cookieHeader) return null

  const cookies = parseCookies(cookieHeader)
  const token = cookies[COOKIE_NAME]
  if (!token) return null

  return verifyToken(token)
}

/**
 * Get session from a raw Cookie header value (e.g. a Socket.io handshake).
 * Same verification path as getSession — one definition of identity.
 * @param cookieHeader - Raw Cookie header string (or null/undefined)
 * @returns Session object or null
 */
export function getSessionFromCookieHeader(cookieHeader: string | null | undefined): Session | null {
  if (!cookieHeader) return null
  const cookies = parseCookies(cookieHeader)
  const token = cookies[COOKIE_NAME]
  if (!token) return null
  return verifyToken(token)
}

/**
 * Set session cookie in response
 * @param response - HTTP response object (NextResponse)
 * @param user - User object
 * @returns Response with cookie set
 */
export function setSession<T extends ResponseWithCookies>(response: T, user: User): T {
  const token = createToken(user)
  // Use NextResponse cookies API if available, otherwise fall back to headers
  if (response.cookies) {
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    })
  } else {
    response.headers.set(
      'Set-Cookie',
      `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 60 * 60}`
    )
  }
  return response
}

/**
 * Clear session cookie
 * @param response - HTTP response object (NextResponse)
 * @returns Response with cookie cleared
 */
export function clearSession<T extends ResponseWithCookies>(response: T): T {
  // Use NextResponse cookies API if available, otherwise fall back to headers
  if (response.cookies) {
    response.cookies.delete(COOKIE_NAME)
  } else {
    response.headers.set(
      'Set-Cookie',
      `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
    )
  }
  return response
}

/**
 * Parse cookies from cookie header string
 * @param cookieHeader - Cookie header string
 * @returns Cookie object
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {}
  if (!cookieHeader) return cookies

  cookieHeader.split(';').forEach((cookie) => {
    const trimmed = cookie.trim()
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) return
    const name = trimmed.slice(0, eqIndex)
    const value = trimmed.slice(eqIndex + 1)
    if (name && value) {
      cookies[name] = decodeURIComponent(value)
    }
  })

  return cookies
}

/**
 * Require authentication middleware
 * @param request - HTTP request
 * @returns Session object
 * @throws Error if not authenticated
 */
export function requireAuth(request: Request): Session {
  const session = getSession(request)
  if (!session) {
    throw new Error('Unauthorized')
  }
  return session
}

/**
 * Privilege-freshness check for the privileged gates only (U4).
 *
 * Compares the token's auth_version claim to users.auth_version (one indexed
 * PK lookup). Grant/revoke paths bump the column, so a stale 30-day token
 * loses its privileges immediately instead of at expiry. Tokens without the
 * claim (minted before U4) fail CLOSED here — but stay valid for ordinary
 * requireAuth, which deliberately makes no DB call. POST /api/auth/refresh
 * is the recovery path after a 401.
 *
 * @throws Error('Unauthorized') when the claim is missing or stale
 */
async function assertPrivilegeFresh(session: Session): Promise<void> {
  if (typeof session.auth_version !== 'number') {
    throw new Error('Unauthorized')
  }
  const row = await queryRow('SELECT auth_version FROM users WHERE id = $1', [session.id])
  if (!row || Number(row.auth_version) !== session.auth_version) {
    throw new Error('Unauthorized')
  }
}

/**
 * Require beta tester or admin access
 * @param request - HTTP request
 * @returns Session object
 * @throws Error if not beta tester or admin, or if the token's privileges are stale
 */
export async function requireBetaAccess(request: Request): Promise<Session> {
  const session = requireAuth(request)
  if (!session.is_beta_tester && !session.is_admin) {
    throw new Error('Beta access required')
  }
  await assertPrivilegeFresh(session)
  return session
}

/**
 * Require admin access
 * @param request - HTTP request
 * @returns Session object
 * @throws Error if not admin, or if the token's privileges are stale
 */
export async function requireAdmin(request: Request): Promise<Session> {
  const session = requireAuth(request)
  if (!session.is_admin) {
    throw new Error('Admin access required')
  }
  await assertPrivilegeFresh(session)
  return session
}

/**
 * Pure entitlement predicate for the locked /stats cohorts — the server-side
 * equivalent of the client gate `isPatron === true || user?.is_admin`
 * (app/stats/page.tsx). Takes a users row (is_admin / is_patron) and answers
 * "may this account see Competitive + Top Player stats?"
 *
 * `users.is_patron` is the materialized source of truth: the patron-status
 * endpoint (app/api/auth/patron-status) writes it TRUE on every positive
 * resolution (DB flag, Discord role, or Patreon API), and the client calls
 * that endpoint before it ever renders the /stats cohorts — so by the time a
 * real patron's browser fires a tournamentOnly / topPlayersOnly request, the
 * flag is already set. Admins are always entitled (patron-status returns
 * isPatron:true for them without setting the flag), so is_admin is checked
 * directly.
 */
export function canSeeFullStats(
  row: { is_admin?: boolean | null; is_patron?: boolean | null } | null | undefined,
): boolean {
  if (!row) return false
  return row.is_admin === true || row.is_patron === true
}

/**
 * Server-side guard for stats requests scoped to the locked cohorts
 * (tournamentOnly / topPlayersOnly). Resolves the caller's entitlement from
 * the users table — the single source of truth shared with the /stats client
 * gate — and throws when they are not entitled. handleApiError maps the thrown
 * message to a 403, so a scraper hitting a locked cohort URL directly gets a
 * 403 instead of the numbers.
 *
 * Anonymous callers (no session) are non-entitled and denied the same way —
 * the locked values must never reach a non-entitled client, logged in or not.
 *
 * @throws Error('Full stats access required') when the caller is not entitled
 */
export async function requireFullStatsAccess(request: Request): Promise<void> {
  const session = getSession(request)
  if (!session) {
    throw new Error('Full stats access required')
  }
  const row = await queryRow(
    'SELECT is_admin, is_patron FROM users WHERE id = $1',
    [session.id],
  )
  if (!canSeeFullStats(row)) {
    throw new Error('Full stats access required')
  }
}

/**
 * Sanitize an OAuth returnTo target so the post-login redirect can only land
 * on this app: a single leading slash (no protocol-relative `//host`, no
 * absolute URLs). Anything else collapses to '/'.
 */
export function sanitizeReturnTo(returnTo: unknown): string {
  if (typeof returnTo !== 'string') return '/'
  if (!/^\/(?!\/)/.test(returnTo)) return '/'
  return returnTo
}

/**
 * Require a valid service key for server-to-server API calls.
 * Used by private endpoints (e.g., SWUTeam integration).
 * Checks Authorization: Bearer header against PTP_SERVICE_KEY env var.
 * @param request - HTTP request
 * @throws Error if service key is missing or invalid
 */
export function requireServiceKey(request: Request): void {
  const serviceKey = process.env['PTP_SERVICE_KEY']
  if (!serviceKey) {
    throw new Error('Service key not configured')
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Unauthorized')
  }

  const token = authHeader.slice(7)
  if (token !== serviceKey) {
    throw new Error('Unauthorized')
  }
}
