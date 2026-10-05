'use client'
import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {useBetaExperience} from '@/src/services/entry/useBetaExperience'
import { type EntryLoadingPage } from './EntrySkeleton'
export default function EntryGate({
  children,
  fallback = '/',
}: {
  children: ReactNode
  fallback?: string
  page?: EntryLoadingPage
}) {
  const {enabled:allowed,loading}=useBetaExperience()
  const router = useRouter()
  useEffect(() => {
    if (!loading && !allowed) router.replace(fallback)
  }, [loading, allowed, fallback, router])
  return loading || !allowed ? <main aria-busy="true" /> : children
}
