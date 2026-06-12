// @ts-nocheck
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { initializeCardCache } from '../../src/utils/cardCache'
import SetSelection from '../../src/components/SetSelection'
import { trackEvent } from '../../src/hooks/useAnalytics'
import { getOrCreateLimitedFlowId, LimitedAnalyticsEvents } from '../../src/analytics/limitedEvents'
import '../../src/App.css'

export default function SoloSealedPage() {
  const router = useRouter()

  useEffect(() => {
    initializeCardCache().catch((error) => {
      console.error('Failed to load cards:', error)
    })
  }, [])

  const handleSetSelect = (setCode: string) => {
    const flowId = getOrCreateLimitedFlowId('sealed:solo')
    trackEvent(LimitedAnalyticsEvents.LIMITED_FLOW_STARTED, {
      format: 'sealed',
      mode: 'solo',
      surface: 'solo_sealed_set_selection',
      source_route: '/sealed',
      flow_id: flowId,
      set_code: setCode,
    })
    const flowParam = flowId ? `&flowId=${encodeURIComponent(flowId)}` : ''
    window.location.href = `/pools/new?set=${setCode}${flowParam}`
  }

  const handleBack = () => {
    router.push('/')
  }

  return (
    <div className="app">
      <SetSelection onSetSelect={handleSetSelect} onBack={handleBack} title="Solo Sealed" />
    </div>
  )
}
