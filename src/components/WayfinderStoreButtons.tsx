'use client'

import './WayfinderStoreButtons.css'

export const WAYFINDER_CHROME_WEB_STORE_URL = 'https://chromewebstore.google.com/detail/wayfinder-companion/econclbajpendbppldcnpngjfddcogfh'
export const WAYFINDER_NEWS_URL = 'https://wayfinder.news'

type BrowserName = 'chrome' | 'safari' | 'firefox'

interface WayfinderStoreButtonsProps {
  /** 'inline' lays the cards in a centered wrapping row (default); 'stack' is a tighter centered column for narrow rails. */
  orientation?: 'stack' | 'inline'
  onChromeClick?: () => void
}

// Real, official browser logos (vendored from github.com/alrra/browser-logos
// under public/icons/browsers). Used nominatively to indicate which browsers
// the companion extension supports.
function BrowserIcon({ browser }: { browser: BrowserName }) {
  return (
    <img
      src={`/icons/browsers/${browser}.svg`}
      alt=""
      width={34}
      height={34}
      loading="lazy"
      decoding="async"
    />
  )
}

// Parallel info hierarchy (R5): every card's subtitle is the *platform* it runs
// on — one consistent axis, no mixing "Brave · Edge" (browsers) with "macOS"
// (OS) with "Desktop" (form factor).
const BROWSERS: Array<{
  browser: BrowserName
  name: string
  sub: string
  status: 'live' | 'soon'
  cta: string
}> = [
  { browser: 'chrome', name: 'Chrome', sub: 'Windows · macOS · Linux', status: 'live', cta: 'Add to Chrome' },
  { browser: 'safari', name: 'Safari', sub: 'macOS', status: 'soon', cta: 'Add to Safari' },
  { browser: 'firefox', name: 'Firefox', sub: 'Windows · macOS · Linux', status: 'soon', cta: 'Add to Firefox' },
]

/**
 * WayfinderCompanionLockup — the compass mark + "wayfinder companion" wordmark,
 * for placing above a heading (replaces the old "Powered by Wayfinder" badge).
 * Real brand assets vendored from the Wayfinder repo into public/branding.
 */
export function WayfinderCompanionLockup({ className = '' }: { className?: string }) {
  return (
    <a
      href={WAYFINDER_NEWS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`wf-lockup ${className}`}
      aria-label="Wayfinder Companion — opens wayfinder.news"
    >
      <img className="wf-lockup-mark" src="/branding/wayfinder_logo.svg" alt="" width={40} height={40} />
      <img className="wf-lockup-wordmark" src="/branding/wayfinder_companion_logotype.svg" alt="Wayfinder Companion" height={20} />
    </a>
  )
}

export function WayfinderStoreButtons({
  orientation = 'inline',
  onChromeClick,
}: WayfinderStoreButtonsProps) {
  return (
    <div className={`wf-store wf-store--${orientation}`}>
      <div className="wf-store-grid" aria-label="Companion browser availability">
        {BROWSERS.map((b) => {
          const isLive = b.status === 'live'
          const className = `wf-browser-card wf-browser-card--${b.browser} ${isLive ? 'is-live' : 'is-soon'}`
          const inner = (
            <>
              {!isLive && <span className="wf-browser-flag">Soon</span>}
              <span className="wf-browser-logo">
                <BrowserIcon browser={b.browser} />
              </span>
              <span className="wf-browser-meta">
                <strong className="wf-browser-name">{b.name}</strong>
                <small className="wf-browser-sub">{b.sub}</small>
              </span>
            </>
          )

          if (isLive) {
            return (
              <a
                key={b.browser}
                href={WAYFINDER_CHROME_WEB_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={className}
                onClick={onChromeClick}
                aria-label={b.cta}
              >
                {inner}
              </a>
            )
          }
          return (
            <span
              key={b.browser}
              className={className}
              role="img"
              aria-label={`${b.name} extension — awaiting approval`}
              title={`${b.name} companion is awaiting store approval`}
            >
              {inner}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export default WayfinderStoreButtons
