'use client'

import { useEffect, useState } from 'react'
import './WayfinderStoreButtons.css'

export const WAYFINDER_CHROME_WEB_STORE_URL = 'https://chromewebstore.google.com/detail/wayfinder-companion/econclbajpendbppldcnpngjfddcogfh'
// The Wayfinder Companion app on the App Store ships the Safari Web Extension
// (macOS + iOS) and the iOS app — desktop Safari and mobile iOS both link here.
export const WAYFINDER_APP_STORE_URL = 'https://apps.apple.com/us/app/wayfinder-companion/id6779564194'
// Back-compat alias (Safari desktop card + anything importing the old name).
export const WAYFINDER_SAFARI_APP_STORE_URL = WAYFINDER_APP_STORE_URL
export const WAYFINDER_FIREFOX_ADDON_URL = 'https://addons.mozilla.org/en-US/firefox/addon/51dd34375c8e4087bdf5/'
export const WAYFINDER_NEWS_URL = 'https://wayfinder.news'

// Card keys: desktop browsers (icons in /icons/browsers) + mobile app stores
// (icons in /icons/stores).
type CardKey = 'chrome' | 'safari' | 'firefox' | 'app-store' | 'google-play'
const STORE_KEYS = new Set<CardKey>(['app-store', 'google-play'])

// Real, official logos (browsers vendored from github.com/alrra/browser-logos;
// store marks under public/icons/stores). Used nominatively.
function BrowserIcon({ browser }: { browser: CardKey }) {
  const dir = STORE_KEYS.has(browser) ? 'stores' : 'browsers'
  return (
    <img
      src={`/icons/${dir}/${browser}.svg`}
      alt=""
      width={34}
      height={34}
      loading="lazy"
      decoding="async"
    />
  )
}

interface BrowserCard {
  browser: CardKey
  name: string
  sub: string
  status: 'live' | 'soon'
  cta: string
  /** Store URL for live cards. Omitted for 'soon' cards. */
  url?: string
}

// Desktop: the browser extension. Subtitle is the platform (one consistent axis).
const DESKTOP_BROWSERS: BrowserCard[] = [
  { browser: 'chrome', name: 'Chrome', sub: 'Windows · macOS · Linux', status: 'live', cta: 'Add to Chrome', url: WAYFINDER_CHROME_WEB_STORE_URL },
  { browser: 'safari', name: 'Safari', sub: 'macOS', status: 'live', cta: 'Add to Safari', url: WAYFINDER_SAFARI_APP_STORE_URL },
  { browser: 'firefox', name: 'Firefox', sub: 'Windows · macOS · Linux', status: 'live', cta: 'Add to Firefox', url: WAYFINDER_FIREFOX_ADDON_URL },
]

// Mobile: the companion ships through the phone app stores. iOS is live on the
// App Store; Android is still in progress.
const MOBILE_BROWSERS: BrowserCard[] = [
  { browser: 'app-store', name: 'App Store', sub: 'iOS · iPadOS', status: 'live', cta: 'Download on the App Store', url: WAYFINDER_APP_STORE_URL },
  { browser: 'google-play', name: 'Google Play', sub: 'Android', status: 'soon', cta: 'Get it on Google Play' },
]

interface WayfinderStoreButtonsProps {
  /** 'inline' lays the cards in a centered wrapping row (default); 'stack' is a tighter centered column for narrow rails. */
  orientation?: 'stack' | 'inline'
  onChromeClick?: () => void
}

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
 * WayfinderCompanionLockup — the compass mark stacked above the Companion
 * logotype. Real brand assets vendored from the Wayfinder repo into
 * public/branding.
 */
export function WayfinderCompanionLockup({ className = '', noLink = false }: { className?: string; noLink?: boolean }) {
  const inner = (
    <>
      <img className="wf-lockup-mark" src="/branding/wayfinder_logo.svg" alt="" width={48} height={48} />
      <img className="wf-lockup-wordmark" src="/branding/wayfinder_companion_logotype.svg" alt="" width={190} height={40} />
    </>
  )
  // When the Companion is already active (e.g. the play-page ready state) the
  // mark is identity, not a CTA — don't link out.
  if (noLink) {
    return <span className={`wf-lockup ${className}`} aria-label="Wayfinder Companion">{inner}</span>
  }
  return (
    <a
      href={WAYFINDER_NEWS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`wf-lockup ${className}`}
      aria-label="Wayfinder Companion — opens wayfinder.news"
    >
      {inner}
    </a>
  )
}

export function WayfinderStoreButtons({
  orientation = 'inline',
  onChromeClick,
}: WayfinderStoreButtonsProps) {
  const isMobile = useIsMobile()
  const cards = isMobile ? MOBILE_BROWSERS : DESKTOP_BROWSERS
  const alsoLine = isMobile ? 'Also available on desktop' : 'Also available on iOS and Android'
  return (
    <div className={`wf-store wf-store--${orientation}`}>
      <div className="wf-store-grid" aria-label="Companion availability">
        {cards.map((b) => {
          const isLive = b.status === 'live'
          const className = `wf-browser-card wf-browser-card--${b.browser} ${isLive ? 'is-live' : 'is-soon'}`
          const inner = (
            <>
              {!isLive && <span className="wf-browser-flag">Coming soon</span>}
              <span className="wf-browser-logo">
                <BrowserIcon browser={b.browser} />
              </span>
              <span className="wf-browser-meta">
                <strong className="wf-browser-name">{b.name}</strong>
                <small className="wf-browser-sub">{b.sub}</small>
              </span>
            </>
          )

          if (isLive && b.url) {
            return (
              <a
                key={b.browser}
                href={b.url}
                target="_blank"
                rel="noopener noreferrer"
                className={className}
                onClick={b.browser === 'chrome' ? onChromeClick : undefined}
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
      <p className="wf-store-also">{alsoLine}</p>
    </div>
  )
}

export default WayfinderStoreButtons
