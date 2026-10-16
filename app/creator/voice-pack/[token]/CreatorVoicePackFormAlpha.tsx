'use client'

/**
 * The creator voice-pack form for alpha viewers. The creator usually is not
 * signed in (the token in the URL is the whole authorization), so they only
 * see this when they happen to be an alpha viewer; everyone else gets the
 * legacy form. Logic lives in useCreatorVoicePackForm; "Publish" is the one
 * primary.
 */
import Button from '@/src/components/Button'
import ThemedPage, { ThemedPanel } from '@/src/components/ThemedPage/ThemedPage'
import type { PublishedVoicePack } from '@/lib/voicePackInvite'
import { VOICE_PACK_CLIP_TYPES } from '@/src/services/voicePacks'
import { CLIP_GUIDE } from '@/src/services/voicePackClipGuide'
import { IMAGE_ACCEPT, MAX_CLIP_BYTES, MAX_LOGO_BYTES } from '@/src/services/voicePackUploads'
import useCreatorVoicePackForm from './useCreatorVoicePackForm'
import CreatorClipRowAlpha from './CreatorClipRowAlpha'
import './creator-voice-pack-alpha.css'

const MB = 1024 * 1024
const SUBTITLE = 'Record the draft calls your players will hear'

interface Props {
  token: string
  note: string | null
  published: PublishedVoicePack | null
}

export default function CreatorVoicePackFormAlpha({ token, note, published }: Props) {
  const form = useCreatorVoicePackForm({ token, note, published })
  const total = VOICE_PACK_CLIP_TYPES.length
  const ready = total - form.missingClips.length

  if (form.status === 'done' && form.savedCode) {
    const updated = form.savedMode === 'updated'
    return (
      <ThemedPage title={updated ? 'Your Changes Are Live' : 'Your Voice Pack Is Live'} subtitle={SUBTITLE} narrow>
        <ThemedPanel className="cvpa-done" aria-label="Published">
          <p className="tpage-copy">
            {updated
              ? 'Everyone who has already unlocked your pack hears the new version. They do not need to redeem anything again.'
              : 'Share this code with your audience. Anyone who enters it at protectthepod.com/redeem unlocks your pack on their account forever, and can use it for every draft they host.'}
          </p>
          <p className="cvpa-code-badge">{form.savedCode}</p>
          <p className="tpage-meta">
            Keep this link: it is how you come back and change your pack. Rerecord a line, swap your
            logo, rename it: the same link opens your pack with everything already in it, and your code
            and everyone who has unlocked it stay exactly as they are.
          </p>
          <div className="tpage-row">
            <Button onClick={() => window.location.reload()}>Make More Changes</Button>
          </div>
        </ThemedPanel>
      </ThemedPage>
    )
  }

  return (
    <ThemedPage title={published ? 'Update Your Voice Pack' : 'Build Your Voice Pack'} subtitle={SUBTITLE}>
      <div className="cvpa-intro">
        <p className="cvpa-lead">
          {published
            ? 'Everything you published is here. Change what you like and publish again: anyone who has already redeemed your code hears the new version straight away.'
            : `Record ${total} short lines and pick a redemption code. Players who enter your code unlock your voice for their drafts: when they host, everyone at their table hears you.`}
        </p>
        <p className="tpage-meta">
          Record each line here with your mic, or upload audio you already have, and play it back before
          you publish.{' '}
          {published
            ? 'A line you leave alone keeps the audio it already has.'
            : 'Bookmark this link: it is how you come back and change your pack later.'}{' '}
          Audio up to {MAX_CLIP_BYTES / MB} MB each (MP3, M4A, OGG, WAV or WebM); logo up to{' '}
          {MAX_LOGO_BYTES / MB} MB (PNG, JPEG, WebP or GIF).
        </p>
      </div>

      {form.draftNotice && (
        <p className="tpage-raised tpage-copy" role="status">
          {form.draftNotice}
          {form.logo === null && form.publishedLogo === null && ' Your logo is not saved here. Choose it again before you publish.'}
        </p>
      )}

      <ThemedPanel label="Your Pack">
        <div className="cvpa-fields">
          <div className="tpage-field">
            <label className="tpage-label" htmlFor="cvpa-name">Pack Name</label>
            <input
              id="cvpa-name"
              className="tpage-input"
              type="text"
              value={form.displayName}
              maxLength={60}
              placeholder="e.g. The Pod Cast Voice Pack"
              onChange={(e) => form.setText('displayName', e.target.value)}
            />
          </div>
          <div className="tpage-field">
            <label className="tpage-label" htmlFor="cvpa-creator">
              Your Name <span className="tpage-muted">(optional)</span>
            </label>
            <input
              id="cvpa-creator"
              className="tpage-input"
              type="text"
              value={form.creatorName}
              maxLength={60}
              placeholder="Shown under the pack name"
              onChange={(e) => form.setText('creatorName', e.target.value)}
            />
          </div>
          <div className="tpage-field">
            <label className="tpage-label" htmlFor="cvpa-code">Redemption Code</label>
            <input
              id="cvpa-code"
              className="tpage-input cvpa-code"
              type="text"
              value={form.code}
              maxLength={24}
              placeholder="PODCAST26"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              aria-describedby="cvpa-code-hint"
              onChange={(e) => form.setText('code', e.target.value)}
            />
            <span className="tpage-meta" id="cvpa-code-hint">
              {form.code.length === 0
                ? '3–24 letters, numbers and hyphens. Not case-sensitive.'
                : form.codeOk
                  ? `Players will type: ${form.normalizedCode}`
                  : 'Use 3–24 letters, numbers and hyphens (no leading or trailing hyphen).'}
            </span>
          </div>
          <div className="tpage-field">
            <label className="tpage-label" htmlFor="cvpa-logo">Logo</label>
            <div className="cvpa-logo">
              {form.logoUrl || form.publishedLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="cvpa-logo-img"
                  src={form.logoUrl ?? (form.publishedLogo as string)}
                  alt={form.logoUrl ? 'Your new pack logo' : 'Your published pack logo'}
                />
              ) : (
                <span className="cvpa-logo-img" aria-hidden="true" />
              )}
              <input
                id="cvpa-logo"
                className="cvpa-logo-input"
                type="file"
                accept={IMAGE_ACCEPT}
                onChange={(e) => form.pickLogo(e.target.files?.[0] ?? null)}
              />
            </div>
            {form.publishedLogo && (
              <span className="tpage-meta">
                {form.logoUrl
                  ? 'This new image replaces your published logo when you publish.'
                  : 'This is your published logo. Choose a file to replace it.'}
              </span>
            )}
          </div>
        </div>
      </ThemedPanel>

      <ThemedPanel label={`Audio Script (${ready} of ${total} ready)`} aria-label="Audio Script">
        <div className="cvpa-clips">
          {VOICE_PACK_CLIP_TYPES.map((clip) => (
            <CreatorClipRowAlpha
              key={clip}
              clip={clip}
              file={form.clips[clip]}
              previewUrl={form.clipUrls[clip]}
              publishedUrl={form.publishedClips[clip]}
              playingExample={form.playingExample === clip}
              usingDefault={form.usingDefault === clip}
              onPick={form.pickClip}
              onDiscard={form.discardClip}
              onToggleExample={form.toggleExample}
              onUseDefault={form.takeDefaultClip}
              registerInput={form.registerClipInput}
            />
          ))}
        </div>
      </ThemedPanel>

      <div className="cvpa-foot">
        {form.missingClips.length > 0 && (
          <p className="tpage-muted">Still needed: {form.missingClips.map((c) => CLIP_GUIDE[c].label).join(', ')}.</p>
        )}
        <Button variant="primary" size="lg" disabled={!form.canSubmit} onClick={form.submit}>
          {form.status === 'submitting' ? 'Uploading…' : published ? 'Publish My Changes' : 'Publish My Voice Pack'}
        </Button>
        {form.errorMessage && (
          <p className="tpage-raised tpage-status tpage-status--danger" role="alert">{form.errorMessage}</p>
        )}
      </div>
    </ThemedPage>
  )
}
