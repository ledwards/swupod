// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/src/contexts/AuthContext'
import { fetchSets } from '@/src/utils/api'
import { createDraft } from '@/src/utils/draftApi'
import { getPackImageUrl } from '@/src/utils/packArt'
import { trackEvent, AnalyticsEvents } from '@/src/hooks/useAnalytics'
import Button from '@/src/components/Button'
import PackSelector from '@/src/components/PackSelector'
import '../../formats/chaos-draft/page.css'

interface SetData {
  code: string
  name: string
  imageUrl?: string
  beta?: boolean
}

export default function LiveChaosDraftPage() {
  const router = useRouter()
  const { user, isAuthenticated } = useAuth()
  const [sets, setSets] = useState<SetData[]>([])
  const [selectedSets, setSelectedSets] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem('chaos-draft-sets') || '[]') } catch { return [] }
  })
  const [packCount, setPackCount] = useState(() => {
    if (typeof window === 'undefined') return 3
    return Number(localStorage.getItem('chaos-draft-count')) || 3
  })
  const [isPublic, setIsPublic] = useState(() => {
    if (typeof window === 'undefined') return true
    const saved = localStorage.getItem('pod-visibility')
    return saved !== null ? saved === 'public' : true
  })
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasBetaAccess = user?.is_beta_tester || user?.is_admin

  useEffect(() => {
    const loadSets = async () => {
      try {
        setLoading(true)
        const setsData = await fetchSets({ includeBeta: hasBetaAccess, includeCarbonite: true })
        setSets(setsData)
      } catch (err) {
        setError('Failed to load sets')
      } finally {
        setLoading(false)
      }
    }
    loadSets()
  }, [hasBetaAccess])

  useEffect(() => {
    localStorage.setItem('chaos-draft-count', String(packCount))
  }, [packCount])

  useEffect(() => {
    localStorage.setItem('chaos-draft-sets', JSON.stringify(selectedSets))
  }, [selectedSets])

  const togglePublic = () => {
    const next = !isPublic
    setIsPublic(next)
    localStorage.setItem('pod-visibility', next ? 'public' : 'private')
  }

  const handlePackCountChange = (delta: number) => {
    const newCount = Math.max(1, Math.min(12, packCount + delta))
    setPackCount(newCount)
    if (selectedSets.length > newCount) {
      setSelectedSets(selectedSets.slice(0, newCount))
    }
  }

  const handleCreate = async () => {
    if (selectedSets.length !== packCount) return

    if (!isAuthenticated) {
      const returnUrl = encodeURIComponent('/draft/chaos')
      window.location.href = `/api/auth/signin/discord?return_to=${returnUrl}`
      return
    }

    try {
      setCreating(true)
      setError(null)

      const result = await createDraft(selectedSets[0], {
        isPublic,
        settings: {
          draftMode: 'chaos',
          chaosSets: selectedSets,
        },
      })

      localStorage.removeItem('chaos-draft-sets')
      localStorage.removeItem('chaos-draft-count')

      const uniqueSets = [...new Set(selectedSets)]
      trackEvent(AnalyticsEvents.CHAOS_DRAFT_CREATED, {
        set_codes: selectedSets,
        unique_sets: uniqueSets.length,
        solo: false,
      })

      router.push(`/draft/${result.shareId}`)
    } catch (err) {
      setError(err.message || 'Failed to create draft')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="chaos-draft-page">
        <div className="chaos-draft-container">
          <div className="loading">Loading sets...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="chaos-draft-page">
      <div className="chaos-draft-container">
        <h1>Live Chaos Draft</h1>
        <p className="chaos-draft-subtitle">
          Select{' '}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', verticalAlign: 'middle', margin: '0 0.4rem' }}>
            <button
              className="pack-count-btn pack-count-minus"
              onClick={() => handlePackCountChange(-1)}
              disabled={packCount <= 1}
            >−</button>
            <span className="pack-count-value">{packCount}</span>
            <button
              className="pack-count-btn pack-count-plus"
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
        />

        <div className="chaos-draft-section selected-sets-order">
          <h3>Your Chaos Draft ({selectedSets.length}/{packCount})</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.75rem', maxWidth: 740, margin: '0 auto' }}>
            {Array.from({ length: packCount }, (_, i) => i).map((slotIndex) => {
              const setCode = selectedSets[slotIndex]
              if (setCode) {
                const packImageUrl = getPackImageUrl(setCode)
                return (
                  <div
                    key={slotIndex}
                    style={{ width: 100, cursor: 'pointer' }}
                    onClick={() => setSelectedSets(prev => [...prev.slice(0, slotIndex), ...prev.slice(slotIndex + 1)])}
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

        {error && <div className="error-message">{error}</div>}

        <div className="chaos-draft-actions">
          <button
            className={`setting-lock ${isPublic ? 'setting-lock-open' : 'setting-lock-closed'}`}
            onClick={togglePublic}
            title={isPublic ? 'Public — visible to other players' : 'Private — only players with the link can join'}
            style={{ alignSelf: 'center' }}
          >
            {isPublic ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            )}
            <span>{isPublic ? 'Public Pod' : 'Private Pod'}</span>
          </button>
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
            disabled={selectedSets.length !== packCount || creating}
            onClick={handleCreate}
          >
            {creating ? 'Creating...' : 'Create Chaos'}
          </Button>
        </div>
      </div>
    </div>
  )
}
