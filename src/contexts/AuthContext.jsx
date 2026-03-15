'use client'

// Authentication context for React
import { createContext, useContext, useState, useEffect } from 'react'
import { getSession, signInWithDiscord, signOut as apiSignOut, enrollBeta as apiEnrollBeta, refreshSession as apiRefreshSession, checkPatronStatus as apiCheckPatronStatus } from '../utils/auth'
import { trackEvent, AnalyticsEvents } from '../hooks/useAnalytics'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isPatron, setIsPatron] = useState(null) // null = loading, true/false = resolved
  const [patronMessage, setPatronMessage] = useState(null) // Message for pending Patreon users

  useEffect(() => {
    // Load session on mount
    loadSession()

    // Also reload session when URL has auth=success (after Discord OAuth)
    // or auth=already_logged_in (if already had session)
    const urlParams = new URLSearchParams(window.location.search)
    const authParam = urlParams.get('auth')
    const authError = urlParams.get('error')
    if (authParam === 'success' || authParam === 'already_logged_in') {
      // Small delay to ensure cookie is set
      setTimeout(() => {
        loadSession()
      }, 100)
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname)
    }
    if (authError) {
      console.error('Discord OAuth error:', decodeURIComponent(authError))
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname)
    }

    // PWA fix: When OAuth completes in the system browser, the PWA still sits
    // at the pre-auth page. Re-check the session when the app becomes visible
    // again (e.g. user switches back to the PWA after completing Discord OAuth).
    // Chrome PWAs share cookies with Chrome browser, so the cookie will be found.
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        loadSession()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  async function loadSession() {
    try {
      const session = await getSession()
      const wasLoggedOut = !user
      setUser(session)
      if (session) {
        apiCheckPatronStatus().then(result => {
          setIsPatron(result.isPatron)
          setPatronMessage(result.message || null)
        })
        // Track sign in if this is a new session (user wasn't logged in before)
        if (wasLoggedOut) {
          trackEvent(AnalyticsEvents.USER_SIGNED_IN, {
            is_beta_tester: session.is_beta_tester,
            is_admin: session.is_admin,
          })
        }
      } else {
        setIsPatron(false)
      }
    } catch (error) {
      console.error('Failed to load session:', error)
      setUser(null)
      setIsPatron(null)
    } finally {
      setLoading(false)
    }
  }

  async function signIn() {
    // Check if we already have a valid session
    const session = await getSession()
    if (session) {
      setUser(session)
      return
    }
    // No session, go through OAuth
    signInWithDiscord()
  }

  async function signOut() {
    trackEvent(AnalyticsEvents.USER_SIGNED_OUT)
    await apiSignOut()
    setUser(null)
  }

  async function enrollBeta() {
    const updatedUser = await apiEnrollBeta()
    if (updatedUser) {
      setUser(updatedUser)
      trackEvent(AnalyticsEvents.BETA_ENROLLED)
      return true
    }
    return false
  }

  async function refreshSession() {
    const updatedUser = await apiRefreshSession()
    if (updatedUser) {
      setUser(updatedUser)
      return true
    }
    return false
  }

  const value = {
    user,
    loading,
    isPatron,
    patronMessage,
    signIn,
    signOut,
    enrollBeta,
    refreshSession,
    isAuthenticated: !!user,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
