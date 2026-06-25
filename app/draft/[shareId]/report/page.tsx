// @ts-nocheck
'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../../src/contexts/AuthContext'
import Button from '../../../../src/components/Button'
import '../../../../src/App.css'
import '../../../../src/styles/backgrounds.css'
import './report.css'
import { getPackArtUrl } from '../../../../src/utils/packArt'

interface PageProps {
  params: Promise<{ shareId: string }>
}

// Fallback avatar for Discord users with no avatar (or a broken avatar URL).
// Reuses the "draftbot"-style Discord default-avatar approach (BOT_AVATARS in
// app/api/draft/[shareId]/dev/add-bots/route.ts).
const DRAFTBOT_AVATAR = 'https://cdn.discordapp.com/embed/avatars/0.png'

function VisibilityLockIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {open ? (
        <>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
        </>
      ) : (
        <>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </>
      )}
    </svg>
  )
}

export default function DraftReportIndexPage({ params }: PageProps) {
  const resolvedParams = use(params)
  const shareId = resolvedParams.shareId
  const router = useRouter()
  const { user, isPatron } = useAuth()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [redirecting, setRedirecting] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [draftReportsPublic, setDraftReportsPublic] = useState(false)
  const [reportReady, setReportReady] = useState(false)

  useEffect(() => {
    if (!shareId) return
    async function fetchIndex() {
      try {
        setLoading(true)
        const res = await fetch(`/api/draft/${shareId}/report`, { credentials: 'include' })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Failed to load' }))
          setError(err.error || 'Failed to load')
          return
        }
        const indexData = await res.json()

        // Skip the player-picker and go straight to the report. Your own report
        // is always the target when you have one; otherwise, if exactly one
        // report is viewable, open that. Fall back to the picker only when the
        // choice is genuinely ambiguous (e.g. a spectator with several public
        // reports to choose from).
        const viewable = (indexData.reports || []).filter(
          r => indexData.isHost || r.isPublic || r.isMe
        )
        const target =
          indexData.myPoolShareId ||
          (viewable.length === 1 ? viewable[0].poolShareId : null)
        if (target) {
          setRedirecting(true)
          router.replace(`/draft/${shareId}/report/${target}`)
          return
        }

        setData(indexData)
        setDraftReportsPublic(indexData.draftReportsPublic || false)
        setReportReady(indexData.reportReady || false)
      } catch {
        setError('Failed to load')
      } finally {
        setLoading(false)
      }
    }
    fetchIndex()
  }, [shareId, router])

  const handleToggleDraftVisibility = async () => {
    const newValue = !draftReportsPublic
    setDraftReportsPublic(newValue)
    try {
      const res = await fetch(`/api/draft/${shareId}/report/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reportPublic: newValue, scope: 'draft' }),
      })
      if (res.ok) {
        setData(prev => prev ? {
          ...prev,
          draft: { ...prev.draft, isPublic: newValue },
          draftReportsPublic: newValue,
          reports: prev.reports.map(report => ({ ...report, isPublic: newValue })),
        } : prev)
        setMessage(newValue ? 'Whole draft is now public' : 'Whole draft is now private')
        setTimeout(() => setMessage(null), 3000)
      } else {
        setDraftReportsPublic(!newValue)
      }
    } catch {
      setDraftReportsPublic(!newValue)
    }
  }

  if (loading || redirecting) {
    return (
      <div className="draft-report-page page-background-with-art">
        <div className="draft-report-loading">Loading...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="draft-report-page page-background-with-art">
        <div className="draft-report-content">
          <div className="draft-report-error">
            <h2>Error</h2>
            <p>{error || 'Not found'}</p>
            <Button variant="back" onClick={() => router.push('/draft')}>Back to Drafts</Button>
          </div>
        </div>
      </div>
    )
  }

  const { draft, reports } = data
  const publicReports = reports.filter(r => data.isHost || r.isPublic || r.isMe)
  const packArtUrl = draft?.setCode ? getPackArtUrl(draft.setCode) : null
  const setArtStyle = packArtUrl ? { backgroundImage: `url("${packArtUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' } : {}

  const completedDate = draft.completedAt
    ? new Date(draft.completedAt).toLocaleDateString('en-US', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
      })
    : null

  return (
    <div className="draft-report-page page-background-with-art">
      {packArtUrl && <div className="set-art-header" style={setArtStyle}></div>}
      <div className="draft-report-page-content">
        <div className="draft-report-header">
          <div className="draft-report-header-content">
            <div className="draft-report-header-info">
              <div className="draft-report-label">Draft Reports</div>
              <h1 className="draft-report-title">{draft.name || `${draft.setName} Draft`}</h1>
              <div className="draft-report-meta">
                {completedDate && `${completedDate} · `}
                {draft.maxPlayers} Players
                {draft.competitive && ' · Competitive'}
                {data.isHost && (
                  <button
                    type="button"
                    className={`draft-report-meta-lock ${draftReportsPublic ? 'lock-public' : 'lock-private'}`}
                    onClick={handleToggleDraftVisibility}
                    title={draftReportsPublic ? 'Whole draft is public — click to make private' : 'Whole draft is private — click to make public'}
                    aria-label={draftReportsPublic ? 'Make the whole draft private' : 'Make the whole draft public'}
                  >
                    <VisibilityLockIcon open={draftReportsPublic} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        {message && <div className="draft-report-message">{message}</div>}
        <div className="draft-report-content">
          {!reportReady ? (
            <div className="draft-report-deck-empty">
              This draft report isn&apos;t ready yet.
              <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                It becomes available once a player has built their deck.
              </div>
            </div>
          ) : publicReports.length === 0 ? (
            <div className="draft-report-deck-empty">
              No public reports for this draft yet.
            </div>
          ) : (
            <div className="draft-report-list">
              {publicReports.map(r => (
                <a
                  key={r.poolShareId}
                  href={`/draft/${shareId}/report/${r.poolShareId}`}
                  className={`draft-report-list-item ${r.hasBuiltDeck ? '' : 'no-deck'}`}
                  title={r.hasBuiltDeck ? undefined : `${r.username} hasn't built a deck yet`}
                >
                  <img
                    src={r.avatarUrl || DRAFTBOT_AVATAR}
                    alt=""
                    className="draft-report-list-avatar"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement
                      if (img.src !== DRAFTBOT_AVATAR) img.src = DRAFTBOT_AVATAR
                    }}
                  />
                  <span className="draft-report-list-name">
                    {r.username}
                    {r.isMe && <span className="draft-report-list-you"> (you)</span>}
                  </span>
                  {!r.hasBuiltDeck && <span className="draft-report-list-nodeck">No deck yet</span>}
                  <span className="draft-report-list-seat">Seat {r.seatNumber}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
