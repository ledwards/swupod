'use client'
import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/src/contexts/AuthContext'
import { hasEntryAccess } from '@/src/services/entry/access'
import { EntrySkeleton, type EntryLoadingPage } from './EntrySkeleton'
export default function EntryGate({
  children,
  fallback = '/',
  page = 'home',
}: {
  children: ReactNode
  fallback?: string
  page?: EntryLoadingPage
}) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const allowed = hasEntryAccess(user)
  useEffect(() => {
    if (!loading && !allowed) router.replace(fallback)
  }, [loading, allowed, fallback, router])
  return loading || !allowed ? <EntrySkeleton page={page} /> : children
}
