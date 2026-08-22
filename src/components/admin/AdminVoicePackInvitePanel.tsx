'use client'

/**
 * AdminVoicePackInvitePanel
 *
 * Mints the single-use creator link for a voice pack and hands the admin a URL to
 * send. Sits below AdminGrantPanel on /admin and follows the same shape: a small
 * dark card, Button variant="toggle" glowColor="blue" for the segmented choice, a
 * primary CTA, and a success/error region below.
 *
 * COPY MATTERS HERE. On /admin this panel sits directly under "Admin: Grant Access",
 * which flips is_admin / is_beta_tester / is_patron on an existing account — and the
 * two were genuinely mistaken for each other ("this is who has access to the voice
 * pack once created, or who has access to the link? not clear"). So the title names
 * the OUTCOME (a creator builds a pack), the subtitle spells out the whole lifecycle,
 * and an explicit disclaimer says this grants nobody any access to anything. Do not
 * shorten these back down to "Creator Voice Pack Link".
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
      <header className="voice-invite-header">
        <span className="voice-invite-eyebrow">Voice packs</span>
        <h2 className="voice-invite-title">Invite a creator to record a voice pack</h2>
        <p className="voice-invite-subtitle">
          Makes a one-time link that you send to an outside creator — a streamer, a
          podcast, anyone with a voice. They open it, record the seven draft calls, pick
          their own redemption code, and publish. The link works exactly once and then
          dies; nothing else on the site points at that page.
        </p>
        <p className="voice-invite-not">
          This grants nobody access to anything. It does not touch accounts, roles or
          permissions — that is the &ldquo;Grant Access&rdquo; panel above. Once the pack
          is published, players unlock it themselves by entering the creator&rsquo;s code
          at <code className="voice-invite-inline-code">/redeem</code>.
        </p>
      </header>

      <label className="voice-invite-field">
        <span className="voice-invite-label">
          Which creator is this for? (optional note, only you see it)
        </span>
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
          {status === 'submitting' ? 'Creating…' : 'Create creator link'}
        </Button>
      </div>

      {status === 'success' && invite && (
        <div className="voice-invite-success" role="status">
          <p className="voice-invite-success-line">
            Send this to {invite.note || 'the creator'}. It works once — the moment they
            publish their pack, the link is dead.
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
