'use client'
import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useAlphaUi } from '@/src/contexts/AlphaUiContext'

/**
 * Native play (/play/native, /lobbies, /lobbies/[id]) is alpha-only and did not
 * exist before it. Everyone else, signed out included, goes home. Nothing
 * renders until the check resolves, so non-alpha never sees the native shell.
 */
export default function AlphaPlayGate({ children }: { children: ReactNode }) {
  const { enabled, loading } = useAlphaUi()
  const router = useRouter()
  useEffect(() => {
    if (!loading && !enabled) router.replace('/')
  }, [loading, enabled, router])
  return loading || !enabled ? <main aria-busy="true" /> : <>{children}</>
}
