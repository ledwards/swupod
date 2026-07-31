'use client'

/**
 * AdminVoicePackInvitePanel
 *
 * Mints the single-use creator link for a voice pack and hands the admin a URL to
 * send. Sits beside AdminGrantPanel on /admin and follows the same shape: a small
 * dark card, Button variant="toggle" glowColor="blue" for the segmented choice, a
 * primary CTA, and a success/error region below.
 *
 * The route returns a PATH, not an absolute URL, so the link is composed here
 * against window.location.origin — the same code then works on localhost, a preview
 * deploy and protectthepod.com without an environment variable.
 */
import { useState } from 'react'
import Button from '@/src/components/Button'
import { INVITE_EXPIRY_DAYS_DEFAULT } from '@/src/services/voicePacks'
import './AdminVoicePackInvitePanel.css'

const EXPIRY_CHOICES = [7, INVITE_EXPIRY_DAYS_DEFAULT, 30] as const

interface MintedInvite {
  url: string
  note: string | null
  expiresAt: string | null
}

export default function AdminVoicePackInvitePanel() {
  const [note, setNote] = useState('')
  const [expiresInDays, setExpiresInDays] = useState<number>(INVITE_EXPIRY_DAYS_DEFAULT)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [invite, setInvite] = useState<MintedInvite | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleCreate() {
    setStatus('submitting')
    setErrorMessage(null)
    setCopied(false)
    try {
      const res = await fetch('/api/admin/voice-pack-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ note: note.trim() || undefined, expiresInDays }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.message ?? `HTTP ${res.status}`)
      setInvite({
        url: window.location.origin + json.data.path,
        note: json.data.note ?? null,
        expiresAt: json.data.expiresAt ?? null,
      })
      setStatus('success')
      setNote('')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not create the link')
      setStatus('error')
    }
  }

  async function handleCopy() {
    if (!invite) return
    try {
      await navigator.clipboard.writeText(invite.url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="voice-invite-panel">
      <h2 className="voice-invite-title">Admin: Creator Voice Pack Link</h2>
      <p className="voice-invite-subtitle">
        Mints a one-time link a creator can use to upload their voice pack and choose a
        redemption code. Nothing else links to that page, so this is the only way in.
      </p>

      <label className="voice-invite-field">
        <span className="voice-invite-label">Who is this for? (optional note)</span>
        <input
          className="voice-invite-input"
          type="text"
          value={note}
          maxLength={60}
          placeholder="e.g. Ahsoka's stream"
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      <div className="voice-invite-field">
        <span className="voice-invite-label">Link expires in</span>
        <div className="voice-invite-toggle-row">
          {EXPIRY_CHOICES.map((days) => (
            <Button
              key={days}
              variant="toggle"
              glowColor="blue"
              active={expiresInDays === days}
              onClick={() => setExpiresInDays(days)}
            >
              {days} days
            </Button>
          ))}
        </div>
      </div>

      <div className="voice-invite-actions">
        <Button variant="primary" disabled={status === 'submitting'} onClick={handleCreate}>
          {status === 'submitting' ? 'Creating…' : 'Create Link'}
        </Button>
      </div>

      {status === 'success' && invite && (
        <div className="voice-invite-success" role="status">
          <p className="voice-invite-success-line">
            Send this to {invite.note || 'the creator'}. It works once, then it&apos;s dead.
          </p>
          <code className="voice-invite-url">{invite.url}</code>
          <div className="voice-invite-copy-row">
            <Button variant="secondary" size="sm" onClick={handleCopy}>
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            {invite.expiresAt && (
              <span className="voice-invite-expiry">
                Expires {new Date(invite.expiresAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      )}

      {status === 'error' && errorMessage && (
        <div className="voice-invite-error" role="alert">
          {errorMessage}
        </div>
      )}
    </div>
  )
}
