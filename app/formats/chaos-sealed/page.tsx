// @ts-nocheck
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/src/contexts/AuthContext'
import { fetchSets } from '@/src/utils/api'
import { getPackImageUrl, getRandomPackImageUrl } from '@/src/utils/packArt'
import { trackEvent, AnalyticsEvents } from '@/src/hooks/useAnalytics'
import Button from '@/src/components/Button'
import PackSelector from '@/src/components/PackSelector'
import PackOpeningAnimation from '@/src/components/PackOpeningAnimation'
import { validateChaosSealedSelection } from '@/src/services/chaosSealedSelection'
import {
  getTeaserUserState,
  shouldPeekUnreleased,
} from '@/src/components/setSelectionTeaser'
import './page.css'

interface SetData {
  code: string
  name: string
  imageUrl?: string
  beta?: boolean
}

interface GeneratedPool {
  shareId: string
  packs: any[]
  packImageUrls: string[]
}

export default function ChaosSealedPage() {
  const router = useRouter()
  const { user, isPatron } = useAuth()
  const [sets, setSets] = useState<SetData[]>([])
  const [selectedSets, setSelectedSets] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem('chaos-sealed-sets') || '[]') } catch { return [] }
  })
  const [packCount, setPackCount] = useState(() => {
    if (typeof window === 'undefined') return 6
    return Number(localStorage.getItem('chaos-sealed-count')) || 6
  })
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAnimation, setShowAnimation] = useState(false)
  const [generatedPool, setGeneratedPool] = useState<GeneratedPool | null>(null)

  const hasBetaAccess = user?.is_beta_tester || user?.is_admin

  // A pool needs at least one Leader-bearing pack to be buildable. Hold the message back
  // until the pool is full — mid-selection it would nag about a state the user is still
  // on their way out of; once it's full it explains why Create Chaos is disabled.
  const selectionValidation = validateChaosSealedSelection(selectedSets)
  const selectionComplete = selectedSets.length === packCount
  const selectionError = selectionComplete && !selectionValidation.ok ? selectionValidation.message : null

  const teaserState = getTeaserUserState(isPatron, user?.is_beta_tester, user?.is_admin)
  const peekUnreleased = shouldPeekUnreleased(teaserState)
  const peekVariant: 'patreon' | 'beta' | false =
    teaserState === 'patronNoBeta' ? 'beta' : teaserState === 'nonSub' ? 'patreon' : false

  useEffect(() => {
    if (teaserState === 'loading') return
    const loadSets = async () => {
      try {
        setLoading(true)
        const setsData = await fetchSets({ includeBeta: hasBetaAccess, includeCarbonite: true, peekUnreleased })
        // GC Event Packs always appear, in their own group. Unlocked ones behave exactly
        // like any other pack (same art, same +/- controls, same pool slots); locked ones
        // stay visible and say what's needed to get them.
        let owned = { silver: false, black: false }
        try {
          const res = await fetch('/api/promo/entitlements?campaign=gc2026', { credentials: 'include' })
          if (res.ok) owned = { ...owned, ...((await res.json())?.data || {}) }
        } catch {
          // Non-fatal — treat as not unlocked.
        }
        const eventPacks: SetData[] = [
          {
            code: 'GC2026_SILVER',
            name: '2026 GC Silver Pack',
            promo: true,
            ...(owned.silver ? {} : {
              locked: {
                label: 'Locked',
                href: '/gift/gc2026',
                description: 'Unlock it with your GC 2026 card',
              },
            }),
          },
          {
            code: 'GC2026_BLACK',
            name: '2026 GC Black Pack',
            promo: true,
            ...(owned.black ? {} : {
              locked: isPatron
                ? {
                    label: 'Unlock',
                    href: '/gift/gc2026/black',
                    description: 'Unlock your Black Pack',
                  }
                : {
                    label: 'Friends only',
                    href: '/gift/gc2026/black',
                    description: 'Available to Friends of the Pod',
                  },
            }),
          },
        ]
        setSets([...setsData, ...eventPacks])
      } catch (err) {
        setError('Failed to load sets')
      } finally {
        setLoading(false)
      }
    }
    loadSets()
  }, [hasBetaAccess, peekUnreleased, teaserState])

  useEffect(() => {
    localStorage.setItem('chaos-sealed-count', String(packCount))
  }, [packCount])

  useEffect(() => {
    localStorage.setItem('chaos-sealed-sets', JSON.stringify(selectedSets))
  }, [selectedSets])

  const handlePackCountChange = (delta: number) => {
    const newCount = Math.max(1, Math.min(12, packCount + delta))
    setPackCount(newCount)
    // Trim selections if new count is smaller
    if (selectedSets.length > newCount) {
      setSelectedSets(selectedSets.slice(0, newCount))
    }
  }

  const handleGenerate = async () => {
    if (selectedSets.length !== packCount || !selectionValidation.ok) return

    try {
      setGenerating(true)
      setError(null)

      const response = await fetch('/api/formats/chaos-sealed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          setCodes: selectedSets,
          packCount
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || data.error || 'Failed to generate pool')
      }

      const result = await response.json()

      // Fetch the full pool data to get the packs
      const poolResponse = await fetch(`/api/pools/${result.data.shareId}`, {
        credentials: 'include'
      })

      if (poolResponse.ok) {
        const poolData = await poolResponse.json()
        const poolInfo = poolData.data
        const packs = typeof poolInfo.packs === 'string' ? JSON.parse(poolInfo.packs) : poolInfo.packs

        // Get random pack image variant for each pack based on their set code
        const packImageUrls = packs.map((pack: any) => getRandomPackImageUrl(pack.setCode))

        setGeneratedPool({
          shareId: result.data.shareId,
          packs,
          packImageUrls
        })

        // Clear saved selections
        localStorage.removeItem('chaos-sealed-sets')
        localStorage.removeItem('chaos-sealed-count')

        // Count unique sets
        const uniqueSets = [...new Set(selectedSets)]
        trackEvent(AnalyticsEvents.CHAOS_SEALED_CREATED, {
          set_codes: selectedSets,
          unique_sets: uniqueSets.length,
          pack_count: packCount,
        })

        setShowAnimation(true)
      } else {
        // If we can't fetch pool data, just redirect
        router.push(`/pool/${result.data.shareId}`)
      }
    } catch (err) {
      setError(err.message || 'Failed to generate pool')
    } finally {
      setGenerating(false)
    }
  }

  const handleAnimationComplete = useCallback(() => {
    if (generatedPool) {
      router.push(`/pool/${generatedPool.shareId}`)
    }
  }, [generatedPool, router])

  // Show pack opening animation
  if (showAnimation && generatedPool) {
    return (
      <PackOpeningAnimation
        packCount={packCount}
        packImageUrls={generatedPool.packImageUrls}
        cardBackUrl="/card-images/card-back.png"
        onComplete={handleAnimationComplete}
        packs={generatedPool.packs}
      />
    )
  }

  if (loading) {
    return (
      <div className="chaos-sealed-page">
        <div className="chaos-sealed-container">
          <div className="loading">Loading sets...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="chaos-sealed-page">
      <div className="chaos-sealed-container">
        <h1>Chaos Sealed</h1>
        <p className="chaos-sealed-subtitle">
          Open{' '}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', verticalAlign: 'middle', margin: '0 0.4rem' }}>
            <button
              className="pack-count-btn pack-count-minus"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, minWidth: 22, minHeight: 22, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.1)', color: 'white', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', padding: 0, lineHeight: 1 }}
              onClick={() => handlePackCountChange(-1)}
              disabled={packCount <= 1}
            >−</button>
            <span style={{ display: 'inline-block', minWidth: '1.5rem', textAlign: 'center', fontWeight: 700, fontSize: '1.3rem', color: 'white' }}>{packCount}</span>
            <button
              className="pack-count-btn pack-count-plus"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, minWidth: 22, minHeight: 22, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.1)', color: 'white', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', padding: 0, lineHeight: 1 }}
              onClick={() => handlePackCountChange(1)}
              disabled={packCount >= 12}
            >+</button>
          </span>
          {' '}packs from any combination of sets!
        </p>

        <PackSelector
          sets={sets}
          selectedSets={selectedSets}
          onSelectSets={setSelectedSets}
          maxSelections={packCount}
          showQuantityControls={true}
          title={`Select ${packCount} Packs (${selectedSets.length}/${packCount})`}
          peekUnreleased={peekVariant}
        />

        <div className="chaos-sealed-section selected-sets-order">
          <h3>Your Chaos Sealed ({selectedSets.length}/{packCount})</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.75rem', maxWidth: 740, margin: '0 auto' }}>
            {Array.from({ length: packCount }, (_, slotIndex) => slotIndex).map((slotIndex) => {
              const setCode = selectedSets[slotIndex]
              if (setCode) {
                const packImageUrl = getPackImageUrl(setCode)
                return (
                  <div
                    key={slotIndex}
                    style={{ width: 100, cursor: 'pointer' }}
                    onClick={() => {
                      setSelectedSets(prev => [...prev.slice(0, slotIndex), ...prev.slice(slotIndex + 1)])
                    }}
                  >
                    <img src={packImageUrl} alt={setCode} style={{ width: '100%', display: 'block', borderRadius: 8 }} />
                  </div>
                )
              }
              return (
                <div key={slotIndex} style={{ width: 100, aspectRatio: '2.5 / 3.5', borderRadius: 8, border: '2px dashed rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)' }} />
              )
            })}
          </div>
        </div>

        {(selectionError || error) && (
          <div className="error-message" role="alert">{selectionError || error}</div>
        )}

        <div className="chaos-sealed-actions">
          <Button
            variant="danger"
            size="lg"
            onClick={() => router.push('/formats')}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            disabled={!selectionComplete || !selectionValidation.ok || generating}
            onClick={handleGenerate}
          >
            {generating ? 'Creating...' : 'Create Chaos'}
          </Button>
        </div>
      </div>
    </div>
  )
}
