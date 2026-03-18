// @ts-nocheck
// Authentication utilities
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env['JWT_SECRET'] || process.env['NEXTAUTH_SECRET'] || 'change-me-in-production'
const COOKIE_NAME = 'swupod_session'

export interface User {
  id: string
  email: string
  username: string
  avatar_url?: string | null
  is_admin?: boolean
  is_beta_tester?: boolean
}

export interface Session {
  id: string
  email: string
  username: string
  avatar_url?: string | null
  is_admin: boolean
  is_beta_tester: boolean
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
      email: user.email,
      username: user.username,
      avatar_url: user.avatar_url,
      is_admin: user.is_admin || false,
      is_beta_tester: user.is_beta_tester || false,
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
 * Require beta tester or admin access
 * @param request - HTTP request
 * @returns Session object
 * @throws Error if not beta tester or admin
 */
export function requireBetaAccess(request: Request): Session {
  const session = requireAuth(request)
  if (!session.is_beta_tester && !session.is_admin) {
    throw new Error('Beta access required')
  }
  return session
}

/**
 * Require admin access
 * @param request - HTTP request
 * @returns Session object
 * @throws Error if not admin
 */
export function requireAdmin(request: Request): Session {
  const session = requireAuth(request)
  if (!session.is_admin) {
    throw new Error('Admin access required')
  }
  return session
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
