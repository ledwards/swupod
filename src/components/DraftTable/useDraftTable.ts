'use client'

import {useEffect, useState} from 'react'
import {useAuth} from '../../contexts/AuthContext'
import {defaultThemeId, normalizeThemeId, themeById, type ThemeConfig} from '../../presentation/purrgil/theme-contract'
import catalog from '../../presentation/purrgil/themes.json'

export const themes = catalog as ThemeConfig[]
const storageKey = 'purrgil-table-v1'

// Match the homepage's cookie-first display preference, retaining other settings.
function savedPreferences(): Record<string, unknown> {
  let cookie: string | undefined
  try { cookie = document.cookie.split('; ').find(part => part.startsWith(storageKey + '='))?.slice(storageKey.length + 1) } catch {}
  for (const read of [() => cookie === undefined ? null : decodeURIComponent(cookie), () => localStorage.getItem(storageKey)]) {
    try {
      const value = JSON.parse(read() ?? 'null')
      if (value && typeof value === 'object' && !Array.isArray(value)) return value
    } catch { /* Fall back to the other store when one is unavailable or invalid. */ }
  }
  return {}
}

function savedTheme() {
  const value = savedPreferences().theme
  return value ? normalizeThemeId(value) : defaultThemeId
}

export function useDraftTable() {
  const {user} = useAuth() as {user: {id: string; is_alpha_tester?: boolean; is_admin?: boolean} | null}
  const [authorizedUser, setAuthorizedUser] = useState<string | null>(null)
  const [themeId, setThemeId] = useState(defaultThemeId)
  const alpha = Boolean(user?.is_alpha_tester || user?.is_admin)
  const enabled = alpha && Boolean(user?.id) && authorizedUser === user?.id
  const theme = themeId === 'default' ? null : themeById(themes, themeId)

  useEffect(() => {
    setThemeId(savedTheme())
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) setThemeId(savedTheme())
    }
    const onTheme = () => setThemeId(savedTheme())
    window.addEventListener('storage', onStorage)
    window.addEventListener('draft-table-theme', onTheme)
    window.addEventListener('purrgil-preferences', onTheme)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('draft-table-theme', onTheme)
      window.removeEventListener('purrgil-preferences', onTheme)
    }
  }, [])

  useEffect(() => {
    setAuthorizedUser(null)
    if (!user?.id || !alpha) return
    const controller = new AbortController()
    let revision = 0
    const check = async () => {
      const current = ++revision
      try {
        const response = await fetch('/api/play/native/presentation', {cache: 'no-store', signal: controller.signal})
        const data = response.ok ? await response.json() : null
        if (!controller.signal.aborted && current === revision) setAuthorizedUser(data?.enabled === true ? user.id : null)
      } catch {
        if (!controller.signal.aborted && current === revision) setAuthorizedUser(null)
      }
    }
    void check()
    const onVisible = () => { if (document.visibilityState === 'visible') void check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      controller.abort()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user?.id, alpha])

  const chooseTheme = (value: string) => {
    const theme = normalizeThemeId(value)
    const saved = JSON.stringify({...savedPreferences(), theme})
    setThemeId(theme)
    try {
      document.cookie = `${storageKey}=${encodeURIComponent(saved)}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
    } catch { /* Keep the local selection when cookies are blocked. */ }
    try { localStorage.setItem(storageKey, saved) } catch { /* Storage can be unavailable. */ }
    window.dispatchEvent(new CustomEvent('draft-table-theme', {detail: theme}))
    window.dispatchEvent(new Event('purrgil-preferences'))
  }

  return {enabled, theme, chooseTheme}
}
