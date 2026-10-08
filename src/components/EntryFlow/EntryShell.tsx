'use client'
import { type ReactNode } from 'react'
import Button from '../Button'
import SetArtHeader from '../SetArtHeader'
import '../../styles/backgrounds.css'
import SiteFooter from '../SiteFooter'
import '../LandingPage.css'
import './entry-flow.css'
export default function EntryShell({
  children,
  banner,
  home = false,
  loading = false,
  back,
  setCode,
}: {
  setCode?: string | null | undefined
  children: ReactNode
  banner?: ReactNode
  home?: boolean
  loading?: boolean
  back?: { label: string; onClick?: () => void } | undefined
}) {
  return (
    <main
      className={`entry-page page-background ${setCode ? "page-background-with-art" : ""} ${home ? "" : "entry-page-inner"}`}
      aria-busy={loading || undefined}
      aria-label={loading ? 'Loading' : undefined}
    >
      <SetArtHeader setCode={setCode} />
      <div className="entry-shell">
        <header className={`entry-header ${home ? 'entry-header-home' : 'entry-header-nav'}`}>
          {!home && <div className="entry-header-back">{back && <Button variant="back" disabled={loading} onClick={back.onClick}>Back</Button>}</div>}
          {home && <a href="/" aria-label="Protect the Pod home">
            <img
              src="/ptp_logo1024.png"
              alt="Protect the Pod"
            />
          </a>}
          {home && <div className="entry-header-banner">{banner}</div>}
        </header>
        {children}
      </div>
      <SiteFooter releaseNotes={home && !loading} />
    </main>
  )
}
