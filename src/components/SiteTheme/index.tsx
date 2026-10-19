'use client'
import {useEffect, useRef, useState, createContext, useContext, type ReactNode} from 'react'
import Link from 'next/link'
import {usePathname} from 'next/navigation'
import AuthWidget from '../AuthWidget'
import build from '../PlayHomepage/build.json'
import {preferenceKey, readTheme, siteThemeProperties} from './preferences'
import {findPageTitle} from './pageTitle'
import {LOCATION_EVENT, watchHistory} from './location'
import {SiteTitleSlotContext} from './title'
export {SiteTitle} from './title'
const SiteThemeContext = createContext(false)
export const useSiteTheme = () => useContext(SiteThemeContext)

export default function SiteTheme({enabled, children}: {enabled: boolean; children: ReactNode}) {
  const ref = useRef<HTMLDivElement>(null)
  const notesRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const [controls, setControls] = useState<{open: (panel: string) => void} | null>(null)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const pathname = usePathname()
  // The homepage shows the large centred masthead instead of the corner logo. Keyed on the
  // real location (not usePathname), so leaving '/' through the bundle drops it at once.
  const [home, setHome] = useState(pathname === '/')
  useEffect(() => {
    if (!enabled) return
    watchHistory()
    const sync = () => setHome(window.location.pathname === '/')
    sync()
    window.addEventListener('popstate', sync)
    window.addEventListener(LOCATION_EVENT, sync)
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener(LOCATION_EVENT, sync) }
  }, [enabled, pathname])
  useEffect(() => {
    if (!enabled) return
    const refresh = () => {
      const id = readTheme()
      document.body.dataset.siteTheme = id
      Object.entries(siteThemeProperties(id)).forEach(([key,value]) => document.body.style.setProperty(key,value))
    }
    const storage = (event: StorageEvent) => { if (!event.key || event.key === preferenceKey) refresh() }
    refresh()
    window.addEventListener('storage', storage)
    window.addEventListener('purrgil-preferences', refresh)
    window.addEventListener('draft-table-theme', refresh)
    return () => {
      window.removeEventListener('storage', storage)
      window.removeEventListener('purrgil-preferences', refresh)
      window.removeEventListener('draft-table-theme', refresh)
    }
  }, [enabled])
  // Overlays and page shells size themselves from --site-header-height; measure the
  // real header so titles, subtitles, and wrapped phone rows never leave a seam.
  // The controls' width is mirrored onto the logo side too, so the title sits at the true centre of the row.
  useEffect(() => {
    if (!enabled || !headerRef.current) return
    const node = headerRef.current, nav = node.querySelector('nav')
    const measure = () => {
      document.body.style.setProperty('--site-header-height', `${Math.round(node.getBoundingClientRect().height)}px`)
      if (nav) node.style.setProperty('--site-nav-width', `${Math.ceil(nav.getBoundingClientRect().width)}px`)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(node); if (nav) observer.observe(nav); measure()
    return () => { observer.disconnect(); document.body.style.removeProperty('--site-header-height') }
  }, [enabled])
  // The route's h1 stays in the document for assistive tech and reading order;
  // the header shows it so every page gets one centered title. See pageTitle.ts.
  useEffect(() => {
    if (!enabled || !contentRef.current) return
    const root = contentRef.current
    let frame = 0, source: HTMLElement | null = null, subSource: HTMLElement | null = null, retryTimer: ReturnType<typeof setTimeout> | undefined, retries = 0
    // A node React has not hydrated yet carries no fiber. Marking it early makes hydration see an attribute it never rendered, so wait for it.
    const hydrated = (element: HTMLElement) => Object.keys(element).some(key => key.startsWith('__reactFiber'))
    const sync = () => {
      frame = 0
      const found = findPageTitle(root)
      if (found && !hydrated(found.element)) { if (retries++ < 60) retryTimer = setTimeout(schedule, 50); return }
      if (source && source !== found?.element) delete source.dataset.siteTitleSource
      if (subSource && subSource !== found?.subtitle?.element) delete subSource.dataset.siteSubtitleSource
      source = found?.element ?? null
      subSource = found?.subtitle?.element ?? null
      if (found) found.element.dataset.siteTitleSource = found.keep ? 'keep' : 'hidden'
      if (subSource) subSource.dataset.siteSubtitleSource = 'hidden'
      setTitle(found?.text ?? '')
      setSubtitle(found?.subtitle?.text ?? '')
      document.body.dataset.siteTitled = found ? 'true' : 'false'
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(sync) }
    sync()
    const observer = new MutationObserver(schedule)
    observer.observe(root, {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-site-title', 'data-site-title-text', 'data-site-subtitle']})
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); if (retryTimer) clearTimeout(retryTimer); if (source) delete source.dataset.siteTitleSource; if (subSource) delete subSource.dataset.siteSubtitleSource }
  }, [enabled, pathname])
  useEffect(() => {
    if (!enabled) return
    let active = true, dispose: (() => void) | undefined
    import(/* webpackIgnore: true */ `/play-home/homepage.js?v=${build.revision}`).then(module => {
      if (!active || !ref.current) return
      const mounted = module.mountWebsiteControls(ref.current, notesRef.current)
      dispose = mounted.dispose
      setControls(mounted)
    }).catch(() => { if (active) setError('Theme controls could not load. Refresh to try again.') })
    return () => { active = false; dispose?.() }
  }, [enabled])
  useEffect(() => { if (controls && new URLSearchParams(location.search).get('settings') === 'account') controls.open('settings') }, [controls, pathname])
  if (!enabled) return <><AuthWidget/>{children}</>
  return <SiteThemeContext.Provider value={true}>
    <header ref={headerRef} className="site-header" aria-label="Site header">
      <div className="site-lead">
        {!home && <Link href="/" className="site-brand" aria-label="Protect the Pod home"><img src="/ptp_logo400.png" alt="" width={400} height={400}/></Link>}
      </div>
      <div className="site-title">
        {title && <span className="site-title-text" aria-hidden="true">{title}</span>}
        {subtitle && <span className="site-subtitle" aria-hidden="true">{subtitle}</span>}
        <div ref={setSlot} className="site-title-slot"/>
      </div>
      <nav aria-label="Site controls">
        <div ref={notesRef} className="site-release-notes"/>
        <button type="button" aria-label="Themes" title="Themes" disabled={!controls} onClick={() => controls?.open('themes')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.2a2 2 0 0 0 1.5-3.3 1.5 1.5 0 0 1 1.1-2.5H18a3 3 0 0 0 3-3C21 7 17 3 12 3Z"/><circle cx="7.5" cy="10" r=".9"/><circle cx="10.5" cy="6.8" r=".9"/><circle cx="15" cy="7.5" r=".9"/></svg></button>
        <button type="button" aria-label="Settings" title="Settings" disabled={!controls} onClick={() => controls?.open('settings')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 3-.6 2.2-2 .9-2-.6L2.5 9.7l1.6 1.6v2.3l-1.6 1.6 2.4 4.2 2-.6 2 .9.6 2.3h5l.6-2.3 2-.9 2 .6 2.4-4.2-1.6-1.6v-2.3l1.6-1.6-2.4-4.2-2 .6-2-.9-.6-2.2z"/><circle cx="12" cy="12.5" r="3.2"/></svg></button>
        <AuthWidget inline/>
      </nav>
    </header>
    {error && <p role="alert">{error}</p>}
    <div ref={ref} className="site-controls-root"/>
    {home && <div className="site-masthead"><img src="/ptp_logo400.png" alt="Protect the Pod" width={400} height={400}/></div>}
    <div ref={contentRef} className="site-content"><SiteTitleSlotContext.Provider value={slot}>{children}</SiteTitleSlotContext.Provider></div>
  </SiteThemeContext.Provider>
}
