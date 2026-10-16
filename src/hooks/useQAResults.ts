'use client'

import { useMemo } from 'react'
import { useCachedJson } from './useCachedJson'
import { groupTestsBySet, type QATestGroup, type QATestResult } from '../services/qaReport'

export interface QAResults {
  available: boolean
  latestRun?: {
    summary: { total: number; passed: number; failed: number }
    runAt: string
    tests: QATestResult[]
  } | null
}

/** The latest `npm run qa` results (`/api/stats/qa`), grouped by set. */
export function useQAResults(setOrder: readonly string[]): { results: QAResults | null; groups: QATestGroup[]; loading: boolean } {
  const { data, loading } = useCachedJson<QAResults>('/api/stats/qa')
  const groups = useMemo(
    () => (data?.available && data.latestRun ? groupTestsBySet(data.latestRun.tests || [], setOrder) : []),
    [data, setOrder],
  )
  return { results: data, groups, loading }
}
