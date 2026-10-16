'use client'

/**
 * /connections/melee for alpha viewers: link a Melee account by proving it
 * owns a one-time code in its public Bio.
 *
 * Same flow as MeleeConnection: GET /api/connections/melee for the current
 * link, then POST begin → verify, plus disconnect and erase, each behind a
 * confirmation. Three states (start, verify, connected) and a Your Data panel
 * under all of them. One primary per state.
 */
import { useEffect, useState } from 'react'
import Button from './Button'
import ContentSkeleton from './ContentSkeleton'
import DiscordLoginButton from './DiscordLoginButton'
import ThemedPage, { ThemedPanel } from './ThemedPage/ThemedPage'
import { CopyIcon, TrashIcon } from './ThemedPage/icons'
import { DownloadIcon } from './DraftLog/icons'
import { CheckIcon } from './PodHub/icons'
import { useAuth } from '../contexts/AuthContext'
import './MeleeConnectionAlpha.css'

type Link = { handle: string; verified_at: string; version: number }
type Challenge = { challengeId: string; marker: string; expiresAt: string; handle: string }
const noticeVersion = '2026-10-08'
const MELEE_SETTINGS = 'https://melee.gg/Profile/Settings'

export default function MeleeConnectionAlpha() {
  const { user, loading } = useAuth() as { user: { username: string } | null; loading: boolean }
  const [link, setLink] = useState<Link | null>(null)
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [handle, setHandle] = useState('')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [confirmErase, setConfirmErase] = useState(false)

  useEffect(() => {
    if (!user) return
    let active = true
    fetch('/api/connections/melee', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Could not retrieve your connection.')
        if (active) setLink(data.link)
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message)
      })
      .finally(() => {
        if (active) setReady(true)
      })
    return () => {
      active = false
    }
  }, [user])

  async function act(action: 'begin' | 'verify' | 'disconnect' | 'erase') {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/connections/melee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, handle, challengeId: challenge?.challengeId, noticeVersion }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not update your connection.')
      if (action === 'begin') setChallenge(data)
      if (action === 'verify') {
        setLink(data.link)
        setChallenge(null)
        setMessage('Melee verified. You can now remove the PTP code from your Bio.')
      }
      if (action === 'disconnect') {
        setLink(null)
        setChallenge(null)
        setConfirmDisconnect(false)
        setMessage('Melee disconnected. Attendance-based cosmetics are no longer available.')
      }
      if (action === 'erase') {
        setLink(null)
        setChallenge(null)
        setConfirmErase(false)
        setMessage('Your private Melee connection and reward snapshot have been erased. Public Melee records are unchanged.')
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Try again.')
    } finally {
      setBusy(false)
    }
  }

  function copyCode(marker: string) {
    void navigator.clipboard
      .writeText(marker)
      .then(() => setMessage('Code copied.'))
      .catch(() => setError('Select and copy the code above.'))
  }

  const pending = loading || (!!user && !ready)

  return (
    <ThemedPage title="Connect Melee" subtitle="Connect your event history to unlock cosmetics" narrow busy={pending || busy}>
      {pending ? (
        <ContentSkeleton kind="card" />
      ) : !user ? (
        <ThemedPanel aria-label="Sign in">
          <p className="tpage-muted">Sign in to connect your Melee account.</p>
          <div className="tpage-row">
            <DiscordLoginButton returnTo="/connections/melee" />
          </div>
        </ThemedPanel>
      ) : (
        <>
          {error && <p className="tpage-raised tpage-status tpage-status--danger" role="alert">{error}</p>}
          {message && (
            <p className="tpage-raised tpage-status tpage-status--success" role="status">
              <CheckIcon />
              <span>{message}</span>
            </p>
          )}

          {link ? (
            <ThemedPanel label="Connection">
              <div className="mlca-who">
                <span className="tpage-tag tpage-tag--success"><CheckIcon />Connected</span>
                <p className="tpage-title">
                  Connected to{' '}
                  <a className="tpage-link" href={`https://melee.gg/Profile/Index/${encodeURIComponent(link.handle)}`} target="_blank" rel="noreferrer">
                    {link.handle}
                  </a>
                </p>
              </div>
              <p className="tpage-muted">
                Verified {new Date(link.verified_at).toLocaleDateString()}. This connection is private to
                Protect the Pod and Wayfinder.
              </p>
              <p className="tpage-copy">
                Remove the PTP verification code from{' '}
                <a className="tpage-link" href={MELEE_SETTINGS} target="_blank" rel="noreferrer">your Melee Bio</a>.
                Preserve any other text. If Melee does not save an empty Bio, enter a single space and save again.
              </p>
              <div className="tpage-row">
                <a className="btn btn--secondary btn--sm" href="/api/connections/melee" download="melee-connection.json">
                  <DownloadIcon />
                  <span>Export Connection Details</span>
                </a>
                {!confirmDisconnect && (
                  <Button size="sm" disabled={busy} onClick={() => setConfirmDisconnect(true)}>Disconnect…</Button>
                )}
              </div>
              {confirmDisconnect && (
                <div className="tpage-raised mlca-confirm">
                  <p className="tpage-copy">Disconnecting removes attendance-based unlocks. Friend of the Pod access stays available.</p>
                  <div className="tpage-row">
                    <Button variant="danger" size="sm" disabled={busy} onClick={() => void act('disconnect')}>Disconnect Melee</Button>
                    <Button size="sm" onClick={() => setConfirmDisconnect(false)}>Keep Connection</Button>
                  </div>
                </div>
              )}
            </ThemedPanel>
          ) : challenge ? (
            <ThemedPanel label={`Verify ${challenge.handle}`}>
              <ol className="mlca-steps">
                <li className="tpage-raised">
                  <div>
                    <span>Copy this code. It expires in 15 minutes.</span>
                    <div className="mlca-code">
                      <code>{challenge.marker}</code>
                      <Button size="sm" disabled={busy} onClick={() => copyCode(challenge.marker)}>
                        <CopyIcon />
                        <span>Copy Code</span>
                      </Button>
                    </div>
                  </div>
                </li>
                <li className="tpage-raised">
                  <div>
                    <span>
                      Open <a className="tpage-link" href={MELEE_SETTINGS} target="_blank" rel="noreferrer">Melee Profile Settings</a>.
                      Find <strong>Bio</strong>, click Edit, add the code on its own line, and Save. Keep your existing Bio text.
                    </span>
                  </div>
                </li>
                <li className="tpage-raised">
                  <div><span>Return here and verify. You can remove the code afterward.</span></div>
                </li>
              </ol>
              <div className="tpage-row">
                <Button variant="primary" disabled={busy} onClick={() => void act('verify')}>Verify My Melee Profile</Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    setChallenge(null)
                    setMessage('You can remove the unused PTP code from your Melee Bio.')
                  }}
                >
                  Cancel
                </Button>
              </div>
            </ThemedPanel>
          ) : (
            <ThemedPanel
              as="form"
              label="Your Melee Account"
              onSubmit={(event) => {
                event.preventDefault()
                void act('begin')
              }}
            >
              <div className="tpage-field">
                <label className="tpage-label" htmlFor="mlca-handle">Melee Username</label>
                <input
                  id="mlca-handle"
                  className="tpage-input"
                  autoComplete="off"
                  required
                  maxLength={64}
                  value={handle}
                  onChange={(event) => setHandle(event.target.value)}
                />
              </div>
              <p className="tpage-muted">
                We&apos;ll ask you to add a one-time code to your public Melee Bio. Sign in to Melee only on
                melee.gg; we never ask for your Melee password.
              </p>
              <p className="tpage-muted">
                By continuing, you connect your Discord account with this Melee account for Protect the Pod
                and Wayfinder event rewards. This may connect your Discord identity to your public name and
                event history. The link stays private and does not change replay or team-sharing settings.
                You can disconnect here. Friends of the Pod do not need to link Melee for available cosmetics.
              </p>
              <p className="mlca-links">
                <a className="tpage-link" href="/privacy-policy">PTP Privacy Policy</a>
                <a className="tpage-link" href="https://wayfinder.news/privacy" target="_blank" rel="noreferrer">Wayfinder Privacy Policy</a>
              </p>
              <div className="tpage-row">
                <Button type="submit" variant="primary" disabled={busy || !handle.trim()}>Continue to Verification</Button>
              </div>
            </ThemedPanel>
          )}

          <ThemedPanel label="Your Data">
            {confirmErase ? (
              <>
                <p className="tpage-copy">
                  Erase your private connection, verification record and reward snapshot from the active
                  services? Attendance unlocks will stop. Your public Melee account and event records will
                  not be changed.
                </p>
                <div className="tpage-row">
                  <Button variant="danger" size="sm" disabled={busy} onClick={() => void act('erase')}>
                    <TrashIcon />
                    <span>Erase Private Connection</span>
                  </Button>
                  <Button size="sm" onClick={() => setConfirmErase(false)}>Keep My Data</Button>
                </div>
              </>
            ) : (
              <>
                <p className="tpage-muted">
                  Erase your private connection, verification record and reward snapshot. Attendance unlocks
                  stop. Your public Melee account and event records are not changed.
                </p>
                <div className="tpage-row">
                  <Button variant="danger" size="sm" disabled={busy} onClick={() => setConfirmErase(true)}>
                    <TrashIcon />
                    <span>Erase Connection Data…</span>
                  </Button>
                </div>
              </>
            )}
          </ThemedPanel>
        </>
      )}
    </ThemedPage>
  )
}
