'use client'
import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {useBetaExperience} from '@/src/services/entry/useBetaExperience'
import {useAuth} from '@/src/contexts/AuthContext'
import { type EntryLoadingPage } from './EntrySkeleton'
export default function EntryGate({
  children,
  fallback = '/',
  allowSignedOut = false,
}: {
  children: ReactNode
  fallback?: string
  allowSignedOut?: boolean
  page?: EntryLoadingPage
}) {
  const {enabled,loading}=useBetaExperience()
  const {user}=useAuth()
  const allowed=enabled||(allowSignedOut&&!user)
  const router = useRouter()
  useEffect(() => {
    if (!loading && !allowed) router.replace(fallback)
  }, [loading, allowed, fallback, router])
  return loading || !allowed ? <main aria-busy="true" /> : children
}
