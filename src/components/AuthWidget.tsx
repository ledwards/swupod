// @ts-nocheck
'use client'

import { useState, useEffect, useRef } from 'react'
import type { MouseEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { fetchUserPools } from '../utils/poolApi'
import { useRouter, usePathname } from 'next/navigation'
import UserAvatar from './UserAvatar'
import './AuthWidget.css'

interface SealedPool {
  shareId: string
  name?: string
  createdAt: string
  poolType?: string
}

interface Pod {
  shareId: string
  draftName?: string
  setCode?: string
  poolShareId?: string
  createdAt: string
  status: string
  isActive?: boolean
}

export default function AuthWidget() {
  const { user, loading, signOut, isPatron } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [latestLivePod, setLatestLivePod] = useState<{ url: string; label: string } | null>(null)
  const [latestSoloPod, setLatestSoloPod] = useState<{ url: string; label: string } | null>(null)
  const [hasShowcases, setHasShowcases] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()

  // Close drawer when clicking outside
  useEffect(() => {
    function handleClickOutside(event: globalThis.MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(event.target as Node)) {
        setDrawerOpen(false)
      }
    }

    if (drawerOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [drawerOpen])

  // Close drawer on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && drawerOpen) {
        setDrawerOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [drawerOpen])

  // Fetch recent pools and drafts when user is logged in and drawer opens
  useEffect(() => {
    if (user && drawerOpen && !loadingData) {
      setLoadingData(true)

      Promise.all([
        fetchUserPools(user.id),
        fetch('/api/draft/history', { credentials: 'include' }).then(r => r.json()),
        fetch('/api/sealed/history', { credentials: 'include' }).then(r => r.json()),
        fetch(`/api/users/${user.id}/showcase-leaders?limit=1`).then(r => r.ok ? r.json() : { total: 0 })
      ])
        .then(([poolsData, draftData, sealedHistoryData, showcaseData]) => {
          const showcaseTotal = showcaseData?.data?.total || showcaseData?.total || 0
          setHasShowcases(showcaseTotal > 0)

          // Latest Solo Pod: most recent non-draft user pool
          const soloPools = (poolsData || [])
            .filter((p: SealedPool) => p.poolType !== 'draft')
            .sort((a: SealedPool, b: SealedPool) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          if (soloPools[0]) {
            setLatestSoloPod({
              url: `/pool/${soloPools[0].shareId}/deck`,
              label: soloPools[0].name || 'Solo Pool',
            })
          } else {
            setLatestSoloPod(null)
          }

          // Latest Live Pod: most recent draft or multiplayer sealed pod
          const allDrafts = draftData?.data?.pods || draftData?.pods || []
          const allSealedPods = sealedHistoryData?.data?.pods || sealedHistoryData?.pods || []

          const liveCandidates: { url: string; label: string; date: Date }[] = []

          const sortedDrafts = [...allDrafts].sort((a: Pod, b: Pod) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
          if (sortedDrafts[0]) {
            const d = sortedDrafts[0]
            const url = d.status === 'complete' && d.poolShareId
              ? `/pool/${d.poolShareId}/deck`
              : `/draft/${d.shareId}`
            liveCandidates.push({ url, label: `${d.setCode} Draft`, date: new Date(d.createdAt) })
          }

          const sortedSealed = [...allSealedPods].sort((a: any, b: any) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
          if (sortedSealed[0]) {
            const s = sortedSealed[0]
            const url = s.poolShareId
              ? `/pool/${s.poolShareId}/deck`
              : `/sealed/${s.shareId}`
            liveCandidates.push({ url, label: `${s.setCode} Sealed`, date: new Date(s.createdAt) })
          }

          liveCandidates.sort((a, b) => b.date.getTime() - a.date.getTime())
          setLatestLivePod(liveCandidates[0] || null)
        })
        .catch(err => {
          console.error('Failed to fetch user data:', err)
          setLatestLivePod(null)
          setLatestSoloPod(null)
        })
        .finally(() => {
          setLoadingData(false)
        })
    }
    // Note: loadingData intentionally excluded from deps - it's a guard, not a trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, drawerOpen])

  const handleSignOut = async () => {
    await signOut()
    setDrawerOpen(false)
  }

  const isHomepage = pathname === '/'

  if (loading) {
    if (isHomepage) return null
    return (
      <div className="auth-widget">
        <div className="auth-widget-loading">...</div>
      </div>
    )
  }

  if (!user) {
    if (isHomepage) return null
    // Build login URL with redirect back to current page
    const loginUrl = `/api/auth/signin/discord?return_to=${encodeURIComponent(pathname || '/')}`
    return (
      <div className="auth-widget">
        <a href={loginUrl} className="btn btn--discord btn--sm auth-widget-login-link" title="Login with Discord">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
              fill="currentColor"
            />
          </svg>
          Login
        </a>
      </div>
    )
  }

  return (
    <div className="auth-widget" ref={drawerRef}>
      <button
        className="auth-widget-avatar-button"
        onClick={() => setDrawerOpen(!drawerOpen)}
        aria-label="User menu"
      >
        <UserAvatar
          src={user.avatar_url}
          alt={user.username || 'User'}
          className="auth-widget-avatar"
          isPatron={isPatron}
          size={36}
          fallback={user.username?.[0]?.toUpperCase() || 'U'}
          placeholderClassName="auth-widget-avatar-placeholder"
        />
      </button>

      {drawerOpen && (
        <>
          <div
            className="auth-widget-drawer-overlay"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="auth-widget-drawer">
            <div className="auth-widget-drawer-header">
              <UserAvatar
                src={user.avatar_url}
                alt={user.username || 'User'}
                className="auth-widget-drawer-avatar"
                isPatron={isPatron}
                size={48}
                fallback={user.username?.[0]?.toUpperCase() || 'U'}
                placeholderClassName="auth-widget-drawer-avatar-placeholder"
              />
              <div className="auth-widget-drawer-user-info">
                <div className="auth-widget-drawer-username">
                  {user.username || 'User'}
                </div>
                {user.email && (
                  <div className="auth-widget-drawer-email">
                    {user.email}
                  </div>
                )}
                {isPatron && !user.is_beta_tester && !user.is_admin && (
                  <a
                    href="/beta"
                    className="auth-widget-beta-link"
                    onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                      e.preventDefault()
                      router.push('/beta')
                      setDrawerOpen(false)
                    }}
                  >
                    Join the Beta Program!
                  </a>
                )}
                {(user.is_beta_tester || user.is_admin) && (
                  <span className="auth-widget-beta-tag">BETA PROGRAM</span>
                )}
              </div>
            </div>

            <div className="auth-widget-drawer-menu">
              {!isHomepage && (
                <a
                  href="/"
                  className="auth-widget-drawer-menu-item"
                  onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                    e.preventDefault()
                    router.push('/')
                    setDrawerOpen(false)
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                  </svg>
                  Home
                </a>
              )}

              <div className="auth-widget-drawer-section-label">Solo Play</div>
              <a
                href="/sealed"
                className="auth-widget-drawer-menu-item"
                onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                  e.preventDefault()
                  router.push('/sealed')
                  setDrawerOpen(false)
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                Sealed
              </a>
              <a
                href="/draft/solo"
                className="auth-widget-drawer-menu-item"
                onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                  e.preventDefault()
                  router.push('/draft/solo')
                  setDrawerOpen(false)
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2 13c0-4 3.5-7 8-7s7 3 7 6c0 2.5-2 4.5-5 5.5H8C4.5 17 2 15.5 2 13zm5 0a1 1 0 100-2 1 1 0 000 2z"/>
                  <path d="M17 12c1-2 3-3.5 5-4-1 2-1 4 0 6-2-1-4-1.5-5-2z"/>
                </svg>
                Draft
              </a>

              <div className="auth-widget-drawer-section-label">Live Pod</div>
              <a
                href="/sealed/pod"
                className="auth-widget-drawer-menu-item"
                onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                  e.preventDefault()
                  router.push('/sealed/pod')
                  setDrawerOpen(false)
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="7" r="3"></circle>
                  <path d="M9 12a5 5 0 0 0-5 5v1h10v-1a5 5 0 0 0-5-5z"></path>
                  <circle cx="17" cy="7" r="3"></circle>
                  <path d="M21 18v-1a4 4 0 0 0-3-3.87"></path>
                </svg>
                Sealed Pod
              </a>
              <a
                href="/draft"
                className="auth-widget-drawer-menu-item"
                onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                  e.preventDefault()
                  router.push('/draft')
                  setDrawerOpen(false)
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <g opacity="0.5">
                    <path d="M4 10c0-2.5 2-4.5 5-4.5s4.5 2 4.5 3.8c0 1.6-1.2 2.8-3.2 3.5H7.5C5.5 12.5 4 11.5 4 10zm3.3-.2a.6.6 0 100-1.2.6.6 0 000 1.2z"/>
                    <path d="M13.5 8.5c.6-1.2 1.8-2 3-2.5-.6 1.2-.6 2.5 0 3.8-1.2-.6-2.4-.9-3-1.3z"/>
                  </g>
                  <path d="M6 14.5c0-2.8 2.3-5 5.5-5s5 2.2 5 4.2c0 1.8-1.4 3.2-3.6 4H10C7.8 17.3 6 16.3 6 14.5zm3.7-.2a.7.7 0 100-1.4.7.7 0 000 1.4z"/>
                  <path d="M16.5 13c.7-1.3 2-2.3 3.5-2.8-.7 1.4-.7 2.8 0 4.2-1.4-.7-2.8-1-3.5-1.4z"/>
                </svg>
                Draft Pod
              </a>

              {(loadingData || latestLivePod || latestSoloPod) && (
                <div className="auth-widget-drawer-divider"></div>
              )}

              {loadingData && (
                <>
                  <div className="auth-widget-drawer-menu-item auth-widget-skeleton-item">
                    <div className="skeleton-icon"></div>
                    <div className="skeleton-text"></div>
                  </div>
                  <div className="auth-widget-drawer-menu-item auth-widget-skeleton-item">
                    <div className="skeleton-icon"></div>
                    <div className="skeleton-text"></div>
                  </div>
                </>
              )}

              {!loadingData && latestLivePod && (
                <a
                  href={latestLivePod.url}
                  className="auth-widget-drawer-menu-item auth-widget-drawer-pool-item"
                  onClick={() => setDrawerOpen(false)}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polygon points="10 8 16 12 10 16 10 8" fill="currentColor"></polygon>
                  </svg>
                  <span>{latestLivePod.label}</span>
                </a>
              )}

              {!loadingData && latestSoloPod && (
                <a
                  href={latestSoloPod.url}
                  className="auth-widget-drawer-menu-item auth-widget-drawer-pool-item"
                  onClick={() => setDrawerOpen(false)}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="3" width="14" height="18" rx="2"></rect>
                    <rect x="8" y="1" width="14" height="18" rx="2"></rect>
                  </svg>
                  <span>{latestSoloPod.label}</span>
                </a>
              )}

              <div className="auth-widget-drawer-divider"></div>

              {hasShowcases && (
                <a
                  href="/showcases"
                  className="auth-widget-drawer-menu-item auth-widget-showcases-item"
                  onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                    e.preventDefault()
                    router.push('/showcases')
                    setDrawerOpen(false)
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L9 9l-7 1 5 5-1.5 7L12 18l6.5 4L17 15l5-5-7-1-3-7z" fill="currentColor" opacity="0.3"/>
                    <path d="M12 2L9 9l-7 1 5 5-1.5 7L12 18l6.5 4L17 15l5-5-7-1-3-7z"/>
                    <line x1="2" y1="2" x2="5" y2="5" strokeLinecap="round"/>
                  </svg>
                  Showcases
                </a>
              )}

              <a
                href="/history"
                className="auth-widget-drawer-menu-item"
                onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                  e.preventDefault()
                  router.push('/history')
                  setDrawerOpen(false)
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                History
              </a>

              <a
                href="/support-the-pod"
                className="auth-widget-drawer-menu-item"
                onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                  e.preventDefault()
                  router.push('/support-the-pod')
                  setDrawerOpen(false)
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
                Support the Pod
              </a>

              <div className="auth-widget-drawer-divider"></div>

              <button
                className="auth-widget-drawer-menu-item"
                onClick={handleSignOut}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Logout
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
