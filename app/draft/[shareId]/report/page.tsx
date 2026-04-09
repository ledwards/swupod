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

export default function DraftReportIndexPage({ params }: PageProps) {
  const resolvedParams = use(params)
  const shareId = resolvedParams.shareId
  const router = useRouter()
  const { user, isPatron } = useAuth()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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

        // If viewer is a participant with a pool, redirect to their report
        if (indexData.myPoolShareId) {
          router.replace(`/draft/${shareId}/report/${indexData.myPoolShareId}`)
          return
        }
      } catch {
        setError('Failed to load')
      } finally {
        setLoading(false)
      }
    }
    fetchIndex()
  }, [shareId, router])

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
  const publicReports = reports.filter(r => r.isPublic || r.isMe)
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
          </div>
        </div>
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
