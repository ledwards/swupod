// @ts-nocheck
import { useEffect } from 'react'
import './SubscribeModal.css'
import { Modal } from './Modal'
import Button from './Button'
import { formatMembershipPrice, PATREON_URL } from '../utils/membership'
import { getSetConfig } from '../utils/setConfigs/index'
import { trackEvent, AnalyticsEvents } from '../hooks/useAnalytics'

/**
 * SubscribeModal — single reusable modal that powers every sub-conversion
 * surface (set-picker teaser, homepage banner CTA, pod-marketing banner CTA).
 *
 * Headline-driven, not variant-enum-driven: each call site passes the
 * specific copy it needs. Default CTA is the Patreon URL; pass `ctaUrl`
 * and `ctaLabel` to override (e.g., for the patron-without-beta branch
 * that points users at /beta instead of Patreon).
 *
 * Plan reference: docs/plans/2026-05-26-...-plan.md U4.
 */

export interface SubscribeModalProps {
  isOpen: boolean
  onClose: () => void
  /** Top-of-modal copy. Required. */
  headline: string
  /**
   * Optional set code to look up for the body subhead. When provided,
   * the subhead surfaces the set name (e.g., "Ashes of the Empire").
   */
  setCode?: string
  /** Override the primary CTA URL. Defaults to PATREON_URL. */
  ctaUrl?: string
  /** Override the primary CTA label. Defaults to "Become a Member". */
  ctaLabel?: string
  /**
   * Optional analytics surface tag. Wired in U7; for now it's a no-op
   * placeholder so call sites can land their surface attribution.
   */
  surface?: 'setPreview' | 'homepageBanner' | 'podBanner'
}

const DEFAULT_CTA_LABEL = 'Become a Friend of the Pod'

/** Format an ISO date string ("2026-07-17") as "July 17, 2026". */
function formatLongDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  // Parse as UTC to avoid timezone slippage at midnight.
  const d = new Date(iso + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

/** Subtract 7 days from a YYYY-MM-DD release date. Pre-release is always
 *  derived as release - 7 days per product spec, even if setConfig has a
 *  separately-listed prereleaseDate. */
function computePrereleaseFromRelease(releaseDateIso: string | null | undefined): string | null {
  if (!releaseDateIso) return null
  const release = new Date(releaseDateIso + 'T00:00:00Z')
  if (Number.isNaN(release.getTime())) return null
  release.setUTCDate(release.getUTCDate() - 7)
  return release.toISOString().slice(0, 10)
}

export function SubscribeModal({
  isOpen,
  onClose,
  headline,
  setCode,
  ctaUrl = PATREON_URL,
  ctaLabel = DEFAULT_CTA_LABEL,
  surface,
}: SubscribeModalProps) {
  const config = setCode ? getSetConfig(setCode.replace('-CB', '')) : null
  const setName = config?.setName ?? setCode ?? null
  const setColor = config?.color || null
  const releaseDateLabel = formatLongDate(config?.releaseDate)
  const prereleaseDateLabel = formatLongDate(computePrereleaseFromRelease(config?.releaseDate))

  // U7 — emit subscribe-cta-shown when the modal first opens for a given
  // (surface, setCode) pair. The PostHog hook silently no-ops when
  // NEXT_PUBLIC_POSTHOG_KEY isn't configured.
  useEffect(() => {
    if (!isOpen || !surface) return
    trackEvent(AnalyticsEvents.SUBSCRIBE_CTA_SHOWN, { surface, setCode: setCode ?? null })
  }, [isOpen, surface, setCode])

  const handleCtaClick = () => {
    if (surface) {
      trackEvent(AnalyticsEvents.SUBSCRIBE_CTA_CLICKED, { surface, setCode: setCode ?? null, ctaUrl })
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton className="subscribe-modal">
      <h2 className="subscribe-modal-headline">{headline}</h2>

      <Modal.Body className="subscribe-modal-body">
        {setName && (
          <p className="subscribe-modal-subhead">
            Friends of the Pod get early access to <strong>{setName}</strong> and every future set before public release.
          </p>
        )}

        {(prereleaseDateLabel || releaseDateLabel) && (
          <p
            className="subscribe-modal-date-info"
            style={setColor ? { borderColor: setColor } : undefined}
          >
            {prereleaseDateLabel && (
              <>
                <strong>Pre-Release Date:</strong> {prereleaseDateLabel}
              </>
            )}
            {prereleaseDateLabel && releaseDateLabel && (
              <span className="subscribe-modal-date-divider"> | </span>
            )}
            {releaseDateLabel && (
              <>
                <strong>Release Date:</strong> {releaseDateLabel}
              </>
            )}
          </p>
        )}

        <ul className="subscribe-modal-benefits">
          <li><strong>Draft Reports</strong> — Review your draft history with detailed pick-by-pick logs, deck breakdowns, and personal notes</li>
          <li><strong>Import Pool</strong> — Photograph your competitive sealed registration sheet and import the pool straight into the deckbuilder</li>
          <li><strong>Professional Stats</strong> — Access draft and sealed data across top limited players</li>
          <li><strong>Beta Access</strong> — Access early features and pre-release sets by becoming an exclusive beta tester</li>
          <li><strong>Discord Access</strong> — Link Discord on Patreon and join the Pod server for your Friend of the Pod role and supporter-only channels</li>
          <li><strong>Avatar Flair</strong> — Special avatar treatment so everyone knows you're a supporter</li>
          <li><strong>Support the Pod</strong> — Earn the eternal gratitude of the community for being a supporter of the pod!</li>
        </ul>

        <p className="subscribe-modal-pod-note">
          <strong>Note:</strong> You can still join a draft pod started by someone who is a Friend of the Pod!
        </p>

        <p className="subscribe-modal-footer-note">
          Already subscribed? Your access activates within minutes — refresh this page after subscribing.
        </p>
        <p className="subscribe-modal-discord-tip">
          <strong>Tip:</strong> Use the same email on Patreon as on this site. If they differ,{' '}
          <a
            href="https://www.patreon.com/settings/apps"
            target="_blank"
            rel="noopener noreferrer"
          >
            link Discord on Patreon
          </a>{' '}
          and join our{' '}
          <a
            href={process.env.NEXT_PUBLIC_DISCORD_INVITE_URL || 'https://discord.gg/u6fkdDzWqF'}
            target="_blank"
            rel="noopener noreferrer"
          >
            Discord server
          </a>{' '}
          so your supporter role syncs automatically.
        </p>
      </Modal.Body>

      <Modal.Actions className="subscribe-modal-actions">
        <a
          href={ctaUrl}
          target={ctaUrl.startsWith('http') ? '_blank' : undefined}
          rel={ctaUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
          className="btn btn--primary btn--md subscribe-modal-cta"
          onClick={handleCtaClick}
        >
          {ctaLabel}
        </a>
        <button
          type="button"
          className="subscribe-modal-dismiss-link"
          onClick={onClose}
        >
          Not now
        </button>
      </Modal.Actions>
    </Modal>
  )
}

export default SubscribeModal
