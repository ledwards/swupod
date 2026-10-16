'use client'

/**
 * AdminVoicePackInvitePanelAlpha: the themed creator-invite panel on /admin
 * (alpha). Same behavior as AdminVoicePackInvitePanel: POST
 * /api/admin/voice-pack-invites, then show the link (composed against
 * window.location.origin) with Copy Link and its expiry.
 *
 * "Create Creator Link" is secondary: the page's one primary is Grant
 * Access's Add. The copy keeps the legacy panel's point: this panel grants
 * nobody access to anything.
 */
import { useState } from 'react'
import Button from '@/src/components/Button'
import { ThemedPanel } from '@/src/components/ThemedPage/ThemedPage'
import { CopyIcon } from '@/src/components/ThemedPage/icons'
import { INVITE_EXPIRY_DAYS_DEFAULT } from '@/src/services/voicePacks'

const EXPIRY_CHOICES = [7, INVITE_EXPIRY_DAYS_DEFAULT, 30] as const

interface MintedInvite {
  url: string
  note: string | null
  expiresAt: string | null
}

export default function AdminVoicePackInvitePanelAlpha() {
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
    <ThemedPanel label="Voice Pack Invite">
      <p className="tpage-muted">
        Makes a link you send to an outside creator: a streamer, a podcast, anyone with a voice.
        They open it, record the draft calls, pick their own redemption code, and publish. The same
        link reopens their pack whenever they want to change it; nothing else on the site points at it.
      </p>
      <p className="tpage-copy tpage-raised">
        This grants nobody access to anything. Once the pack is published, players unlock it
        themselves by entering the creator&rsquo;s code at /redeem.
      </p>

      <div className="tpage-field">
        <label className="tpage-label" htmlFor="adma-invite-note">
          Which creator is this for? <span className="tpage-muted">(optional, only you see it)</span>
        </label>
        <input
          id="adma-invite-note"
          className="tpage-input"
          type="text"
          value={note}
          maxLength={60}
          placeholder="e.g. Ahsoka's stream"
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="tpage-field">
        <span className="tpage-label" id="adma-invite-expiry">Link Expires In</span>
        <div className="tpage-row" role="group" aria-labelledby="adma-invite-expiry">
          {EXPIRY_CHOICES.map((days) => (
            <Button
              key={days}
              variant="toggle"
              active={expiresInDays === days}
              aria-pressed={expiresInDays === days}
              onClick={() => setExpiresInDays(days)}
            >
              {days} days
            </Button>
          ))}
        </div>
      </div>

      <div className="tpage-row">
        <Button disabled={status === 'submitting'} onClick={handleCreate}>
          {status === 'submitting' ? 'Creating…' : 'Create Creator Link'}
        </Button>
      </div>

      {status === 'success' && invite && (
        <div className="tpage-raised adma-invite" role="status">
          <p className="tpage-copy">
            Send this to {invite.note || 'the creator'}. It is their way into the pack: they publish
            from it, and come back to it to make changes.
          </p>
          <code className="adma-url">{invite.url}</code>
          <div className="tpage-row">
            <Button size="sm" onClick={handleCopy}>
              <CopyIcon />
              <span>{copied ? 'Copied' : 'Copy Link'}</span>
            </Button>
            {invite.expiresAt && (
              <span className="tpage-meta">Expires {new Date(invite.expiresAt).toLocaleString()}</span>
            )}
          </div>
        </div>
      )}

      {status === 'error' && errorMessage && (
        <p className="tpage-raised tpage-status tpage-status--danger" role="alert">{errorMessage}</p>
      )}
    </ThemedPanel>
  )
}
