'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import ContentSkeleton from '../ContentSkeleton'
import DiscordLoginButton from '../DiscordLoginButton'
import { AspectIcon } from '../AspectIcon'
import { SiteTitle } from '../SiteTheme'
import SiteFooter from '../SiteFooter'
import { MetaArt } from '../Meta/MetaBits'
import { formatPoolLabel } from '../../utils/poolDisplayName'
import { PATREON_URL } from '../../utils/membership'
import { reportAspects, reportMeta } from '../../services/draftReports/reportRow'
import type { DraftReportEntry } from '../../services/draftReports/reportRow'
import '../YourStats/YourStats.css'
import '../Meta/meta.css'
import './draft-reports.css'

const SUBTITLE = 'Your completed draft reports'

/** Friends of the Pod gate, shared by the signed-out and non-patron states. */
function Gate({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="drp-panel drp-gate" aria-label="Friends of the Pod">
      <img src="/patreon/friendofthepod.png" alt="" width={56} height={56}/>
      <h2>A Friends of the Pod Feature</h2>
      <p>Review your draft history with pick-by-pick logs, deck breakdowns, and personal notes.</p>
      {signedIn
        ? <a className="btn btn--primary btn--md" href={PATREON_URL} target="_blank" rel="noopener noreferrer">Become a Friend of the Pod</a>
        : <DiscordLoginButton returnTo="/draft/reports"/>}
    </section>
  )
}

const Chevron = () => <svg className="drp-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>

/**
 * Draft Reports (alpha): every finished draft you sat in, newest first. Each row
 * opens that draft's log, where the report now lives.
 */
export default function DraftReports() {
  const { user, isPatron, loading: authLoading } = useAuth() as {
    user: { id?: string } | null; isPatron: boolean | null; loading: boolean
  }
  const [reports, setReports] = useState<DraftReportEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    fetch('/api/draft/reports', { credentials: 'include' })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('Failed to load reports'))))
      .then(data => { if (!cancelled) setReports(data.reports || []) })
      .catch(() => { if (!cancelled) { setError('Failed to load reports'); setReports([]) } })
    return () => { cancelled = true }
  }, [user])

  const pending = authLoading || (user && (isPatron === null || (isPatron && reports === null)))

  let body
  if (pending) {
    body = <section className="drp-panel" aria-label="Reports" aria-busy="true"><ContentSkeleton kind="row" count={4}/></section>
  } else if (!user || isPatron === false) {
    body = <Gate signedIn={Boolean(user)}/>
  } else if (error) {
    body = <section className="drp-panel drp-empty" aria-label="Reports"><p role="alert">{error}</p></section>
  } else if (!reports?.length) {
    body = (
      <section className="drp-panel drp-empty" aria-label="No reports">
        <h2>No Draft Reports Yet</h2>
        <p>Finish a draft and its report shows up here.</p>
        <a className="btn btn--primary btn--md" href="/draft">Start a Draft</a>
      </section>
    )
  } else {
    body = (
      <section className="drp-panel drp-panel--labeled" aria-label="Reports">
        <h2 className="drp-panel-label">Reports ({reports.length})</h2>
        <div className="drp-list">
          {reports.map(report => (
            <a key={report.draftShareId} className="drp-row" href={`/draft/${encodeURIComponent(report.draftShareId)}/log`}>
              <MetaArt src={report.leaderBackImageUrl} size={56}/>
              <span className="drp-main">
                <span className="drp-title">
                  <b>{report.name || formatPoolLabel(report.setName, 'draft')}</b>
                  {report.competitive && <span className="drp-tag">Competitive</span>}
                </span>
                <span className="drp-meta">{reportMeta(report)}</span>
                {(report.leaderName || report.baseName) && (
                  <span className="drp-meta">{[report.leaderName, report.baseName].filter(Boolean).join(' · ')}</span>
                )}
              </span>
              <span className="drp-aspects">
                {reportAspects(report).map(a => <AspectIcon key={a} aspect={a} size="md"/>)}
              </span>
              <Chevron/>
            </a>
          ))}
        </div>
      </section>
    )
  }

  return (
    <div className="drp-page">
      <SiteTitle subtitle={SUBTITLE}>Draft Reports</SiteTitle>
      <main className="drp-content">{body}</main>
      <SiteFooter/>
    </div>
  )
}
