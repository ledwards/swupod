// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { initializeCardCache } from '../../src/utils/cardCache'
import SetSelection from '../../src/components/SetSelection'
import SealedPackCountToggle from '../../src/components/SealedPackCountToggle'
import { STANDARD_SEALED_PACKS_PER_PLAYER } from '../../src/utils/sealedPodConfig'
import {
  readSealedPackCountPreference,
  saveSealedPackCountPreference,
} from '../../src/utils/sealedPackCountPreference'
import { trackEvent } from '../../src/hooks/useAnalytics'
import { getOrCreateLimitedFlowId, LimitedAnalyticsEvents } from '../../src/analytics/limitedEvents'
import '../../src/App.css'

export default function SoloSealedPage() {
  const router = useRouter()
  // Free 6-vs-8 pack choice; carried to /pools/new as ?packs=N. Seeded from the
  // player's last choice, so picking 8 once makes 8 the default from then on.
  const [packCount, setPackCount] = useState(() =>
    readSealedPackCountPreference(STANDARD_SEALED_PACKS_PER_PLAYER))

  const choosePackCount = (count: number) => {
    setPackCount(count)
    saveSealedPackCountPreference(count)
  }

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
      pack_count: packCount,
    })
    const flowParam = flowId ? `&flowId=${encodeURIComponent(flowId)}` : ''
    window.location.href = `/pools/new?set=${setCode}&packs=${packCount}${flowParam}`
  }

  const handleBack = () => {
    router.push('/')
  }

  return (
    <div className="app">
      <SetSelection
        onSetSelect={handleSetSelect}
        onBack={handleBack}
        title="Solo Sealed"
        headerAction={<SealedPackCountToggle value={packCount} onChange={choosePackCount} />}
      />
    </div>
  )
}
