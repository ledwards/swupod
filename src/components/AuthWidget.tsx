// @ts-nocheck
'use client'

import { useState, useEffect, useRef } from 'react'
import type { MouseEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { fetchUserPools } from '../utils/poolApi'
import { formatPoolLabel } from '../utils/poolDisplayName'
import { poolDisplayName } from '../utils/archetypeName'
import { useRouter, usePathname } from 'next/navigation'
import UserAvatar from './UserAvatar'
import './AuthWidget.css'

interface SealedPool {
  id: string
  shareId: string
  name?: string
  setCode?: string
  createdAt: string
  updatedAt?: string
  poolType?: string
  parentPoolId?: string | null
  leaderName?: string | null
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

// Total items in the Recent Activity section (active pod + pools + History button)
const RECENT_ACTIVITY_TOTAL = 4

// Import Pool is in limited testing — only admins and a short allowlist
// (by Discord username or email) see it in the user menu.
const IMPORT_POOL_USERNAMES = ['terronk']
const IMPORT_POOL_EMAILS = ['lee@root.vc']

interface RecentItem {
  url: string
  label: string
  kind: 'pod' | 'pool'
}

export default function AuthWidget() {
  const { user, loading, signOut, isPatron } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activePod, setActivePod] = useState<RecentItem | null>(null)
  const [myLobby, setMyLobby] = useState<{
    shareId: string
    setCode: string
    format: string
    deckName: string | null
  } | null>(null)
  const [recentPools, setRecentPools] = useState<RecentItem[]>([])
  const [hasShowcases, setHasShowcases] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  // "NEW" badge on My Stats until the user first opens /me. Re-checked each time
  // the drawer opens so it clears once they've visited.
  const [meStatsSeen, setMeStatsSeen] = useState(true)
  useEffect(() => {
    try { setMeStatsSeen(localStorage.getItem('ptp:me-visited') === '1') } catch { /* no-op */ }
  }, [drawerOpen])
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
        fetch(`/api/users/${user.id}/showcase-leaders?limit=1`).then(r => r.ok ? r.json() : { total: 0 }),
        fetch('/api/open-games/mine', { credentials: 'include' })
          .then(r => (r.ok ? r.json() : { listing: null }))
          .catch(() => ({ listing: null })),
      ])
        .then(([poolsData, draftData, showcaseData, lobbyData]) => {
          setMyLobby((lobbyData?.data || lobbyData)?.listing ?? null)
          const showcaseTotal = showcaseData?.data?.total || showcaseData?.total || 0
          setHasShowcases(showcaseTotal > 0)

          // Active draft pod = a pod the user is in that is NOT yet complete.
          // Show only one (the most recent). Links to the live draft page.
          const allDrafts = draftData?.data?.pods || draftData?.pods || []
          const sortedDrafts = [...allDrafts].sort((a: Pod, b: Pod) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
          const running = sortedDrafts.find((d: Pod) => d.status !== 'complete') || null
          if (running) {
            setActivePod({
              kind: 'pod',
              url: `/draft/${running.shareId}`,
              label: formatPoolLabel(running.setCode, 'draft'),
            })
          } else {
            setActivePod(null)
          }

          // Recent pools: group the user's pools by root (parentPoolId || id) so multiple
          // builds of the same pool collapse into one entry. The display label is the
          // most recently selected deck's leader — letting the user tell pools apart
          // by the deck they last worked on, instead of "Sealed / Sealed / Sealed".
          const activePoolShareId = running?.poolShareId
          const remainingSlots = RECENT_ACTIVITY_TOTAL - 1 /* History button */ - (running ? 1 : 0)
          const pools: SealedPool[] = (poolsData || [])
            .filter((p: SealedPool) => !activePoolShareId || p.shareId !== activePoolShareId)
          const groups = new Map<string, SealedPool>()
          for (const p of pools) {
            const rootKey = p.parentPoolId || p.id
            const existing = groups.get(rootKey)
            const pickedAt = new Date(p.updatedAt || p.createdAt).getTime()
            const existingAt = existing ? new Date(existing.updatedAt || existing.createdAt).getTime() : -Infinity
            if (pickedAt > existingAt) groups.set(rootKey, p)
          }
          const recents = Array.from(groups.values())
            .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
            .slice(0, Math.max(0, remainingSlots))
            .map((p) => ({
              kind: 'pool' as const,
              url: `/pool/${p.shareId}/deck`,
              // Canonical pool name: archetype + date when there's a deck, else
              // SET + format + date. The recent-pools list only carries the
              // leader (no base), so the archetype is the leader name here.
              label: poolDisplayName({
                archetypeShort: p.leaderName,
                setCode: p.setCode,
                poolType: p.poolType,
                date: p.createdAt,
              }),
            }))
          setRecentPools(recents)
        })
        .catch(err => {
          console.error('Failed to fetch user data:', err)
          setActivePod(null)
          setRecentPools([])
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

  // Gate Import Pool to admins + the testing allowlist (covers "me"/lee, terronk).
  const canImportPool =
    user?.is_admin === true ||
    IMPORT_POOL_EMAILS.includes((user?.email || '').toLowerCase()) ||
    IMPORT_POOL_USERNAMES.includes((user?.username || '').toLowerCase())

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
        <a href={loginUrl} className="auth-widget-login-circle" title="Login with Discord">
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
              {myLobby && (
                <a
                  href={`/g/${myLobby.shareId}`}
                  className="auth-widget-drawer-menu-item auth-widget-open-lobby-item"
                  onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                    e.preventDefault()
                    router.push(`/g/${myLobby.shareId}`)
                    setDrawerOpen(false)
                  }}
                >
                  <span className="auth-widget-open-lobby-dot" aria-hidden="true" />
                  <span className="auth-widget-open-lobby-text">
                    <strong>Your Open Lobby</strong>
                    <span>
                      {myLobby.deckName ||
                        `${myLobby.setCode} ${myLobby.format === 'draft' ? 'Draft' : 'Sealed'}`}{' '}
                      · waiting for an opponent
                    </span>
                  </span>
                </a>
              )}

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

              <a
                href="/me"
                className="auth-widget-drawer-menu-item"
                onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                  e.preventDefault()
                  try { localStorage.setItem('ptp:me-visited', '1') } catch { /* no-op */ }
                  setMeStatsSeen(true)
                  router.push('/me')
                  setDrawerOpen(false)
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3v18h18" />
                  <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
                </svg>
                My Stats
                {!meStatsSeen && <span className="auth-widget-new-badge">NEW</span>}
              </a>

              <div className="auth-widget-drawer-section-label">Recent Activity</div>

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

              {!loadingData && activePod && (
                <a
                  href={activePod.url}
                  className="auth-widget-drawer-menu-item auth-widget-drawer-pool-item"
                  onClick={() => setDrawerOpen(false)}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polygon points="10 8 16 12 10 16 10 8" fill="currentColor"></polygon>
                  </svg>
                  <span>{activePod.label}</span>
                </a>
              )}

              {!loadingData && recentPools.map((p) => (
                <a
                  key={p.url}
                  href={p.url}
                  className="auth-widget-drawer-menu-item auth-widget-drawer-pool-item"
                  onClick={() => setDrawerOpen(false)}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="3" width="14" height="18" rx="2"></rect>
                    <rect x="8" y="1" width="14" height="18" rx="2"></rect>
                  </svg>
                  <span>{p.label}</span>
                </a>
              ))}

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

              <div className="auth-widget-drawer-section-label">Perks</div>

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

              {isPatron && (
                <a
                  href="/draft/reports"
                  className="auth-widget-drawer-menu-item auth-widget-draft-reports-item"
                  onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                    e.preventDefault()
                    router.push('/draft/reports')
                    setDrawerOpen(false)
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,215,0,0.9)" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                  </svg>
                  Draft Reports
                </a>
              )}

              {canImportPool && (
                <a
                  href="/import"
                  className="auth-widget-drawer-menu-item auth-widget-import-pool-item"
                  onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                    e.preventDefault()
                    router.push('/import')
                    setDrawerOpen(false)
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,215,0,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <path d="M8 13h8"></path>
                    <path d="M8 17h5"></path>
                    <path d="M9 6h2"></path>
                  </svg>
                  <span className="auth-widget-menu-text">
                    <span className="auth-widget-menu-title">Import Pool</span>
                    <span className="auth-widget-menu-subtitle">Scan a sealed registration sheet</span>
                  </span>
                </a>
              )}

              <a
                href="/support-the-pod"
                className="auth-widget-drawer-menu-item auth-widget-support-the-pod-item"
                onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                  e.preventDefault()
                  router.push('/support-the-pod')
                  setDrawerOpen(false)
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,215,0,0.9)" strokeWidth="2">
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
