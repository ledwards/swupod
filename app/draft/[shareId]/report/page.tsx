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

function VisibilityLockIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [draftReportsPublic, setDraftReportsPublic] = useState(false)

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
        setData(indexData)
        setDraftReportsPublic(indexData.draftReportsPublic || false)
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

  if (loading) {
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
              </div>
            </div>
            <div className="draft-report-header-actions">
              {data.isHost && (
                <Button
                  variant={draftReportsPublic ? 'primary' : 'danger'}
                  onClick={handleToggleDraftVisibility}
                  title={draftReportsPublic ? 'Make the whole draft private' : 'Make the whole draft public'}
                  className="draft-report-visibility-button"
                  style={{
                    borderColor: draftReportsPublic ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)',
                    boxShadow: draftReportsPublic ? '0 0 8px rgba(0, 255, 0, 0.2)' : '0 0 8px rgba(255, 0, 0, 0.2)',
                  }}
                >
                  <VisibilityLockIcon open={draftReportsPublic} />
                  <span>{draftReportsPublic ? 'Draft Public' : 'Draft Private'}</span>
                </Button>
              )}
            </div>
          </div>
        </div>
        {message && <div className="draft-report-message">{message}</div>}
        <div className="draft-report-content">
          {publicReports.length === 0 ? (
            <div className="draft-report-deck-empty">
              No public reports for this draft yet.
            </div>
          ) : (
            <div className="draft-report-list">
              {publicReports.map(r => (
                <a
                  key={r.poolShareId}
                  href={`/draft/${shareId}/report/${r.poolShareId}`}
                  className="draft-report-list-item"
                >
                  <img
                    src={r.avatarUrl || '/icons/discord-logo.png'}
                    alt=""
                    className="draft-report-list-avatar"
                  />
                  <span className="draft-report-list-name">
                    {r.username}
                    {r.isMe && <span className="draft-report-list-you"> (you)</span>}
                  </span>
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
