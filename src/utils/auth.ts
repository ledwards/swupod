// @ts-nocheck
// Frontend authentication utilities

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] || '/api'

interface User {
  id: string
  username: string
  avatar_url?: string
  is_admin?: boolean
  is_beta_tester?: boolean
}

/**
 * Get current session
 * @returns Session object or null
 */
export async function getSession(): Promise<User | null> {
  try {
    const response = await fetch(`${API_BASE}/auth/session`, {
      credentials: 'include',
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return data.data?.user || null
  } catch (error) {
    console.error('Failed to get session:', error)
    return null
  }
}

/**
 * Sign in with Discord
 */
export function signInWithDiscord(): void {
  // Store current URL to return after login
  const returnTo = encodeURIComponent(window.location.pathname + window.location.search)
  window.location.href = `${API_BASE}/auth/signin/discord?return_to=${returnTo}`
}

/**
 * Sign out current user
 * @returns Success status
 */
export async function signOut(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/auth/signout`, {
      method: 'POST',
      credentials: 'include',
    })

    if (!response.ok) {
      return false
    }

    // Reload page to clear client-side state
    window.location.reload()
    return true
  } catch (error) {
    console.error('Failed to sign out:', error)
    return false
  }
}

/**
 * Check if user is authenticated
 * @returns True if authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession()
  return session !== null
}

/**
 * Refresh session with latest user data from database
 * Updates the session cookie with fresh data (role flags, etc.)
 * @returns Updated user object or null on failure
 */
export async function refreshSession(): Promise<User | null> {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return data.data?.user || null
  } catch (error) {
    console.error('Failed to refresh session:', error)
    return null
  }
}

export interface PatronStatusResult {
  isPatron: boolean
  pendingPatreon?: boolean
  message?: string
}

/**
 * Check if current user is a Patreon patron (has Discord role).
 * Also returns pendingPatreon + message if they subscribed but haven't linked Discord on Patreon.
 */
export async function checkPatronStatus(): Promise<PatronStatusResult> {
  try {
    const response = await fetch(`${API_BASE}/auth/patron-status`, {
      credentials: 'include',
    })

    if (!response.ok) {
      return { isPatron: false }
    }

    const data = await response.json()
    return {
      isPatron: data.data?.isPatron === true,
      pendingPatreon: data.data?.pendingPatreon || false,
      message: data.data?.message || undefined,
    }
  } catch (error) {
    console.error('Failed to check patron status:', error)
    return { isPatron: false }
  }
}

/**
 * Enroll current user as beta tester
 * Returns the updated user object (session cookie is also updated)
 * @returns Updated user object or null on failure
 */
export async function enrollBeta(): Promise<User | null> {
  try {
    const response = await fetch(`${API_BASE}/beta/enroll`, {
      method: 'POST',
      credentials: 'include',
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return data.data?.user || null
  } catch (error) {
    console.error('Failed to enroll in beta:', error)
    return null
  }
}
