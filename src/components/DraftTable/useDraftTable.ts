'use client'

import {useEffect, useState} from 'react'
import {useAuth} from '../../contexts/AuthContext'
import {normalizeThemeId, themeById, type ThemeConfig} from '../../presentation/purrgil/theme-contract'
import catalog from '../../presentation/purrgil/themes.json'

export const themes = catalog as ThemeConfig[]
const storageKey = 'purrgil-table-v1'

function savedTheme() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? '{}')?.theme
    return value ? normalizeThemeId(value) : 'default'
  } catch { return 'default' }
}

export function useDraftTable() {
  const {user} = useAuth() as {user: {id: string; is_beta_tester?: boolean; is_admin?: boolean} | null}
  const [authorizedUser, setAuthorizedUser] = useState<string | null>(null)
  const [themeId, setThemeId] = useState('default')
  const beta = Boolean(user?.is_beta_tester || user?.is_admin)
  const enabled = beta && Boolean(user?.id) && authorizedUser === user?.id
  const theme = themeId === 'default' ? null : themeById(themes, themeId)

  useEffect(() => {
    setThemeId(savedTheme())
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) setThemeId(savedTheme())
    }
    const onTheme = (event: Event) => setThemeId((event as CustomEvent<string>).detail)
    window.addEventListener('storage', onStorage)
    window.addEventListener('draft-table-theme', onTheme)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('draft-table-theme', onTheme)
    }
  }, [])

  useEffect(() => {
    setAuthorizedUser(null)
    if (!user?.id || !beta) return
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
  }, [user?.id, beta])

  const chooseTheme = (value: string) => {
    setThemeId(value)
    window.dispatchEvent(new CustomEvent('draft-table-theme', {detail: value}))
    let saved: Record<string, unknown> = {}
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed
    } catch { /* Recover an invalid old preference instead of blocking future saves. */ }
    try {
      localStorage.setItem(storageKey, JSON.stringify({...saved, theme: value}))
    } catch { /* The selected table still works when browser storage is unavailable. */ }
  }

  return {enabled, theme, chooseTheme}
}
