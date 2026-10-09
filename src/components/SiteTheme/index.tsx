'use client'
import {useEffect, useRef, useState, createContext, useContext, type ReactNode} from 'react'
import Link from 'next/link'
import {usePathname} from 'next/navigation'
import AuthWidget from '../AuthWidget'
import build from '../PlayHomepage/build.json'
import {preferenceKey, readTheme, siteThemeProperties} from './preferences'
const SiteThemeContext = createContext(false)
export const useSiteTheme = () => useContext(SiteThemeContext)

export default function SiteTheme({enabled, children}: {enabled: boolean; children: ReactNode}) {
  const ref = useRef<HTMLDivElement>(null)
  const notesRef = useRef<HTMLDivElement>(null)
  const [controls, setControls] = useState<{open: (panel: string) => void} | null>(null)
  const [error, setError] = useState('')
  const pathname = usePathname()
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
    <header className="site-header" aria-label="Site header">
      <Link href="/" className="site-brand" aria-label="Protect the Pod home"><img src="/ptp_logo400.png" alt="Protect the Pod"/></Link>
      <nav aria-label="Site controls">
        <div ref={notesRef} className="site-release-notes"/>
        <button type="button" aria-label="Themes" title="Themes" disabled={!controls} onClick={() => controls?.open('themes')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.2a2 2 0 0 0 1.5-3.3 1.5 1.5 0 0 1 1.1-2.5H18a3 3 0 0 0 3-3C21 7 17 3 12 3Z"/><circle cx="7.5" cy="10" r=".9"/><circle cx="10.5" cy="6.8" r=".9"/><circle cx="15" cy="7.5" r=".9"/></svg></button>
        <button type="button" aria-label="Settings" title="Settings" disabled={!controls} onClick={() => controls?.open('settings')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 3-.6 2.2-2 .9-2-.6L2.5 9.7l1.6 1.6v2.3l-1.6 1.6 2.4 4.2 2-.6 2 .9.6 2.3h5l.6-2.3 2-.9 2 .6 2.4-4.2-1.6-1.6v-2.3l1.6-1.6-2.4-4.2-2 .6-2-.9-.6-2.2z"/><circle cx="12" cy="12.5" r="3.2"/></svg></button>
        <AuthWidget inline/>
      </nav>
    </header>
    {error && <p role="alert">{error}</p>}
    <div ref={ref} className="site-controls-root"/>
    <div className="site-content">{children}</div>
  </SiteThemeContext.Provider>
}
