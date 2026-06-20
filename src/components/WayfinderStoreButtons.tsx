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

type DesktopBrowser = 'chrome' | 'safari' | 'firefox'

// Which desktop browser are we in? Chromium variants (Edge/Brave/Opera) map to
// 'chrome' — the Chrome Web Store extension installs on all of them.
function detectDesktopBrowser(): DesktopBrowser | null {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent
  if (/Firefox\//.test(ua)) return 'firefox'
  if (/Safari\//.test(ua) && !/Chrome|Chromium|Edg|OPR|Brave/.test(ua)) return 'safari'
  if (/Chrome|Chromium|Edg|OPR/.test(ua)) return 'chrome'
  return null
}

interface WayfinderStoreButtonsProps {
  /** 'inline' lays the cards in a centered wrapping row (default); 'stack' is a tighter centered column for narrow rails. */
  orientation?: 'stack' | 'inline'
  /** 'all' (default) shows every browser. 'current' auto-detects the browser
   *  you're in and shows only its card, listing the rest in the "also" line. */
  mode?: 'all' | 'current'
  onChromeClick?: () => void
}

/** Coarse pointer / narrow viewport = treat as a phone/tablet. A reported width
 *  of 0 is "unknown" (some headless / detached renderers), NOT mobile. */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth
      const coarse = window.matchMedia('(pointer: coarse)').matches
      setIsMobile(coarse || (w > 0 && w <= 640))
    }
    update()
    const mq = window.matchMedia('(max-width: 640px), (pointer: coarse)')
    mq.addEventListener?.('change', update)
    window.addEventListener('resize', update)
    return () => {
      mq.removeEventListener?.('change', update)
      window.removeEventListener('resize', update)
    }
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

// "Also available …" line, with platform logos before iOS / Android. When
// `extraBrowsers` is set (autodetect mode) it leads with the other desktop
// browsers, then the mobile platforms.
function AlsoAvailable({ extraBrowsers, isMobile }: { extraBrowsers: string[] | null; isMobile: boolean }) {
  if (isMobile) return <p className="wf-store-also">Also available on desktop</p>
  return (
    <p className="wf-store-also">
      {extraBrowsers && extraBrowsers.length > 0 ? (
        <>
          Also available on {extraBrowsers.join(' and ')}
          <br />
          and on{' '}
        </>
      ) : (
        'Also available on '
      )}
      <img className="wf-store-also-icon" src="/icons/apple.svg" alt="" width={13} height={13} />
      iOS and{' '}
      <img className="wf-store-also-icon" src="/icons/android.svg" alt="" width={14} height={14} />
      Android
    </p>
  )
}

export function WayfinderStoreButtons({
  orientation = 'inline',
  mode = 'all',
  onChromeClick,
}: WayfinderStoreButtonsProps) {
  const isMobile = useIsMobile()
  const [currentBrowser, setCurrentBrowser] = useState<DesktopBrowser | null>(null)
  useEffect(() => {
    setCurrentBrowser(detectDesktopBrowser())
  }, [])

  // Autodetect (desktop) shows a single prominent install button for the browser
  // you're in and lists the rest in the "also" line. Until detection resolves, or
  // in 'all' mode, show every card.
  const single =
    !isMobile && mode === 'current' && currentBrowser
      ? DESKTOP_BROWSERS.find((b) => b.browser === currentBrowser) || null
      : null
  const cards = isMobile ? MOBILE_BROWSERS : DESKTOP_BROWSERS
  const extraBrowsers = single
    ? DESKTOP_BROWSERS.filter((b) => b.browser !== single.browser).map((b) => b.name)
    : null

  return (
    <div className={`wf-store wf-store--${orientation}${mode === 'current' ? ' wf-store--current' : ''}`}>
      {single ? (
        <a
          className={`wf-install-btn wf-browser-card--${single.browser}`}
          href={single.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={single.browser === 'chrome' ? onChromeClick : undefined}
          aria-label={single.cta}
        >
          <span className="wf-install-btn-logo">
            <BrowserIcon browser={single.browser} />
          </span>
          <span className="wf-install-btn-label">{single.cta}</span>
        </a>
      ) : (
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
      )}
      <AlsoAvailable extraBrowsers={extraBrowsers} isMobile={isMobile} />
    </div>
  )
}

export default WayfinderStoreButtons
