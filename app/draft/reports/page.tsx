// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../src/contexts/AuthContext'
import Button from '../../../src/components/Button'
import '../../../src/App.css'
import './reports.css'

interface DraftReportEntry {
  draftShareId: string
  name: string
  setCode: string
  setName: string
  maxPlayers: number
  completedAt: string | null
  startedAt: string | null
  competitive: boolean
  seatNumber: number
  leaderName: string | null
  leaderImageUrl: string | null
}

export default function DraftReportsPage() {
  const router = useRouter()
  const { user, isPatron, loading: authLoading } = useAuth()
  const [reports, setReports] = useState<DraftReportEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchReports() {
      try {
        setLoading(true)
        const res = await fetch('/api/draft/reports', { credentials: 'include' })
        if (!res.ok) {
          setError('Failed to load reports')
          return
        }
        const data = await res.json()
        setReports(data.reports || [])
      } catch {
        setError('Failed to load reports')
      } finally {
        setLoading(false)
      }
    }

    if (user) {
      fetchReports()
    }
  }, [user])

  if (authLoading || loading) {
    return (
      <div className="draft-reports-page">
        <div className="draft-reports-loading">Loading...</div>
      </div>
    )
  }

  if (isPatron === false) {
    return (
      <div className="draft-reports-page">
        <div className="draft-reports-content">
          <div className="draft-reports-empty">
            <h2>Friends of the Pod</h2>
            <p>Draft Reports are available exclusively for Friends of the Pod.</p>
            <Button variant="back" onClick={() => router.push('/draft')}>Back to Drafts</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="draft-reports-page">
      <div className="draft-reports-content">
        <div className="draft-reports-header">
          <h1>Draft Reports</h1>
          <p>Your completed draft reports</p>
        </div>

        {error && <p style={{ color: 'red', textAlign: 'center' }}>{error}</p>}

        {reports.length === 0 && !error ? (
          <div className="draft-reports-empty">
            No draft reports yet. Join a draft to get started!
          </div>
        ) : (
          <div className="draft-reports-list">
            {reports.map(report => (
              <a
                key={report.draftShareId}
                href={`/draft/${report.draftShareId}/report`}
                className="draft-reports-item"
                onClick={(e) => {
                  e.preventDefault()
                  router.push(`/draft/${report.draftShareId}/report`)
                }}
              >
                <div className="draft-reports-item-leader">
                  {report.leaderImageUrl && (
                    <img src={report.leaderImageUrl} alt={report.leaderName || ''} />
                  )}
                </div>
                <div className="draft-reports-item-info">
                  <div className="draft-reports-item-name">
                    {report.name || `${report.setName} Draft`}
                  </div>
                  <div className="draft-reports-item-meta">
                    {report.completedAt
                      ? new Date(report.completedAt).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric'
                        })
                      : 'In progress'}
                    {' · '}{report.setName}
                    {' · '}{report.maxPlayers} players
                    {report.leaderName && ` · ${report.leaderName}`}
                  </div>
                </div>
                {report.competitive && (
                  <div className="draft-reports-item-badge">COMPETITIVE</div>
                )}
              </a>
            ))}
          </div>
        )}

        <div style={{ marginTop: '2rem' }}>
          <Button variant="back" onClick={() => router.push('/draft')}>Back to Drafts</Button>
        </div>
      </div>
    </div>
  )
}
