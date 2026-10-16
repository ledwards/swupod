// @ts-nocheck
'use client'

import { useEffect, useState, use } from 'react'
import { loadPool } from '../../../src/utils/poolApi'
import '../../../src/App.css'

interface PageProps {
  params: Promise<{ shareId: string }>
}

export default function PoolRedirectPage({ params }: PageProps) {
  const resolvedParams = use(params)
  const [shareId, setShareId] = useState<string | null>(null)

  useEffect(() => {
    setShareId(resolvedParams.shareId)
  }, [resolvedParams])

  useEffect(() => {
    if (!shareId) return

    let retries = 0
    const maxRetries = 5

    const attemptLoad = async () => {
      try {
        const poolData = await loadPool(shareId)

        // Redirect based on pool type
        if (poolData.poolType === 'draft') {
          window.location.href = `/pools/${shareId}`
        } else {
          window.location.href = `/pools/${shareId}`
        }
      } catch (err) {
        console.error(`Failed to load pool (attempt ${retries + 1}):`, err)

        if (err instanceof Error && (err.message.includes('not found') || err.message.includes('Pool not found')) && retries < maxRetries) {
          retries++
          await new Promise(resolve => setTimeout(resolve, 1000 * retries))
          return attemptLoad()
        }

        // If we can't determine the type, default to sealed
        window.location.href = `/pools/${shareId}`
      }
    }

    attemptLoad()
  }, [shareId])

  return (
    <div className="app">
      <div className="loading"></div>
    </div>
  )
}
