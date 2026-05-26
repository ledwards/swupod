// @ts-nocheck
import './SubscribeModal.css'
import { Modal } from './Modal'
import Button from './Button'
import { formatMembershipPrice, PATREON_URL } from '../utils/membership'
import { getSetConfig } from '../utils/setConfigs/index'

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
  surface?: 'setPreview' | 'homepageBanner' | 'lockInBanner' | 'podBanner'
}

const DEFAULT_CTA_LABEL = 'Become a Member'

export function SubscribeModal({
  isOpen,
  onClose,
  headline,
  setCode,
  ctaUrl = PATREON_URL,
  ctaLabel = DEFAULT_CTA_LABEL,
  // surface is reserved for U7 analytics wiring; not used in render yet.
  surface: _surface,
}: SubscribeModalProps) {
  const setName = setCode ? getSetConfig(setCode.replace('-CB', ''))?.setName ?? setCode : null
  const priceLabel = formatMembershipPrice()

  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton className="subscribe-modal">
      <h2 className="subscribe-modal-headline">{headline}</h2>

      <Modal.Body className="subscribe-modal-body">
        {setName && (
          <p className="subscribe-modal-subhead">
            Friends of the Pod get early access to <strong>{setName}</strong> and every future set before public release.
          </p>
        )}

        <ul className="subscribe-modal-benefits">
          <li>Early access to upcoming sets — draft and seal weeks before public release.</li>
          <li>"Friend of the Pod" role and supporter badge in our Discord.</li>
          <li>Vote on community polls — direction of new features and monthly themed events.</li>
          <li>Your handle in the supporter credits on <code>/support-the-pod</code>.</li>
        </ul>

        <p className="subscribe-modal-price">
          <strong>{priceLabel}</strong>. Existing members continue at their original rate — we never auto-raise.
        </p>

        <p className="subscribe-modal-footer-note">
          Already subscribed? Your access activates within minutes — refresh this page after subscribing.
        </p>
      </Modal.Body>

      <Modal.Actions className="subscribe-modal-actions">
        <a
          href={ctaUrl}
          target={ctaUrl.startsWith('http') ? '_blank' : undefined}
          rel={ctaUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
          className="btn btn--primary btn--md subscribe-modal-cta"
        >
          {ctaLabel}
        </a>
        <Button variant="secondary" onClick={onClose}>
          Not now
        </Button>
      </Modal.Actions>
    </Modal>
  )
}

export default SubscribeModal
