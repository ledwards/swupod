'use client'

import { useEffect, useState } from 'react'
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

interface BrowserCard {
  browser: BrowserName
  name: string
  sub: string
  status: 'live' | 'soon'
  cta: string
}

// Desktop: the browser extension. Subtitle is the platform (one consistent axis).
const DESKTOP_BROWSERS: BrowserCard[] = [
  { browser: 'chrome', name: 'Chrome', sub: 'Windows · macOS · Linux', status: 'live', cta: 'Add to Chrome' },
  { browser: 'safari', name: 'Safari', sub: 'macOS', status: 'soon', cta: 'Add to Safari' },
  { browser: 'firefox', name: 'Firefox', sub: 'Windows · macOS · Linux', status: 'soon', cta: 'Add to Firefox' },
]

// Mobile: the companion's mobile builds. Per Wayfinder, iOS Safari and Chrome
// on mobile are not public yet, so both are "Soon".
const MOBILE_BROWSERS: BrowserCard[] = [
  { browser: 'safari', name: 'Safari', sub: 'iOS', status: 'soon', cta: 'Get on iOS' },
  { browser: 'chrome', name: 'Chrome', sub: 'Android', status: 'soon', cta: 'Get on Android' },
]

/** Coarse pointer / narrow viewport = treat as a phone/tablet. */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px), (pointer: coarse)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener?.('change', update)
    return () => mq.removeEventListener?.('change', update)
  }, [])
  return isMobile
}

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
  const isMobile = useIsMobile()
  const cards = isMobile ? MOBILE_BROWSERS : DESKTOP_BROWSERS
  const alsoOn = isMobile ? 'desktop' : 'mobile'
  return (
    <div className={`wf-store wf-store--${orientation}`}>
      <div className="wf-store-grid" aria-label="Companion availability">
        {cards.map((b) => {
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
              aria-label={`${b.name} — coming soon`}
              title={`${b.name} companion is coming soon`}
            >
              {inner}
            </span>
          )
        })}
      </div>
      <p className="wf-store-also">Also available for {alsoOn}</p>
    </div>
  )
}

export default WayfinderStoreButtons
