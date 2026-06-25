// @ts-nocheck
'use client'

/**
 * ObserverHostControl — host-only control on the live draft page to enable the
 * Privileged Observer (a public, no-login live slideshow link for streaming),
 * then copy or disable that link. PATCHes pods.observer_public via the report
 * visibility endpoint.
 */

import { useState } from 'react'
import Button from './Button'

interface ObserverHostControlProps {
  shareId: string
  initialEnabled?: boolean
}

export default function ObserverHostControl({ shareId, initialEnabled = false }: ObserverHostControlProps) {
  const [enabled, setEnabled] = useState(!!initialEnabled)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const observerUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/draft/${shareId}/observe` : ''

  const flash = (text: string) => {
    setMsg(text)
    setTimeout(() => setMsg(null), 2500)
  }

  const setObserver = async (value: boolean) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/draft/${shareId}/report/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ observerPublic: value }),
      })
      if (res.ok) {
        setEnabled(value)
        flash(value ? 'Observer link enabled' : 'Observer link disabled')
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false)
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(observerUrl)
      flash('Observer link copied!')
    } catch {
      /* ignore */
    }
  }

  return (
    <span className="observer-host-control" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      {!enabled ? (
        <Button
          size="sm"
          glowColor="yellow"
          onClick={() => setObserver(true)}
          disabled={busy}
          title="Generate a public, no-login link to stream this draft as a live slideshow"
        >
          {busy ? 'Enabling…' : 'Enable Privileged Observer'}
        </Button>
      ) : (
        <>
          <Button size="sm" glowColor="yellow" onClick={copyLink} title={observerUrl}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            <span>Copy Observer Link</span>
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setObserver(false)} disabled={busy} title="Disable the public observer link">
            Disable
          </Button>
        </>
      )}
      {msg && (
        <span className="observer-host-msg" style={{ fontSize: '0.8rem', color: 'rgba(255, 215, 0, 0.9)' }}>
          {msg}
        </span>
      )}
    </span>
  )
}
