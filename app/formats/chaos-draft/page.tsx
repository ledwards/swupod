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
import { splitSelection, validateChaosSealedSelection } from '@/src/services/chaosSealedSelection'
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

export default function ChaosDraftPage() {
  const router = useRouter()
  const { user, isAuthenticated, isPatron } = useAuth()
  const [sets, setSets] = useState<SetData[]>([])
  const [selectedSets, setSelectedSets] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem('chaos-draft-sets') || '[]') } catch { return [] }
  })
  const [packCount, setPackCount] = useState(() => {
    if (typeof window === 'undefined') return 4
    // Default 4; clamp to the 1–4 range in case a stale localStorage value predates the cap.
    return Math.min(4, Number(localStorage.getItem('chaos-draft-count')) || 4)
  })
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasBetaAccess = user?.is_beta_tester || user?.is_admin

  // Event Packs don't fill a set-pack slot (only set packs count toward packCount); opt-in,
  // each selected Event Pack is drafted as its own bonus round appended after the set packs.
  const { setPacks, promoPacks } = splitSelection(selectedSets)
  const selectionValidation = validateChaosSealedSelection(selectedSets)
  const selectionComplete = setPacks.length === packCount
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
        // GC Event Packs appear in their own group, opt-in. Unlocked ones can be added (they
        // augment the drafted pool); locked ones stay visible and say what's needed to get them.
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
    localStorage.setItem('chaos-draft-count', String(packCount))
  }, [packCount])

  useEffect(() => {
    localStorage.setItem('chaos-draft-sets', JSON.stringify(selectedSets))
  }, [selectedSets])

  // Selections are one flat list; these rebuild it from the two halves so a click removes the
  // pack the user actually clicked on, in either row.
  const removeSetPackAt = (index: number) => {
    setSelectedSets([...setPacks.slice(0, index), ...setPacks.slice(index + 1), ...promoPacks])
  }
  const removePromoPackAt = (index: number) => {
    setSelectedSets([...setPacks, ...promoPacks.slice(0, index), ...promoPacks.slice(index + 1)])
  }

  const handlePackCountChange = (delta: number) => {
    const newCount = Math.max(1, Math.min(4, packCount + delta))
    setPackCount(newCount)
    // Only set packs occupy slots, so Event Packs survive the trim untouched.
    if (setPacks.length > newCount) {
      setSelectedSets([...setPacks.slice(0, newCount), ...promoPacks])
    }
  }

  const handleCreate = async () => {
    if (setPacks.length !== packCount || !selectionValidation.ok) return

    if (!isAuthenticated) {
      const returnUrl = encodeURIComponent('/formats/chaos-draft')
      window.location.href = `/api/auth/signin/discord?return_to=${returnUrl}`
      return
    }

    try {
      setCreating(true)
      setError(null)

      // Event Packs are drafted as their own bonus rounds, appended after the set packs — so
      // they ride in chaosSets like any other pack (each becomes a round). They're shown in a
      // separate opt-in row above, but functionally they're extra draft rounds.
      const result = await createDraft(setPacks[0], {
        isPublic: false,
        settings: {
          isSolo: true,
          draftMode: 'chaos',
          chaosSets: [...setPacks, ...promoPacks],
        }
      })

      // Clear saved selections
      localStorage.removeItem('chaos-draft-sets')
      localStorage.removeItem('chaos-draft-count')

      const uniqueSets = [...new Set(setPacks)]
      trackEvent(AnalyticsEvents.CHAOS_DRAFT_CREATED, {
        set_codes: setPacks,
        unique_sets: uniqueSets.length,
        event_packs: promoPacks.length,
        solo: true,
      })

      // Auto-add 7 bots
      await fetch(`/api/draft/${result.shareId}/dev/add-bots?count=7`, {
        method: 'POST',
        credentials: 'include',
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
        <h1>Solo Chaos Draft</h1>
        <p className="chaos-draft-subtitle">
          Select{' '}
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
              disabled={packCount >= 4}
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
          title={`Select ${packCount} Packs (${setPacks.length}/${packCount})`}
          peekUnreleased={peekVariant}
        />

        <div className="chaos-draft-section selected-sets-order">
          <h3>Your Chaos Draft ({setPacks.length}/{packCount})</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.75rem', maxWidth: 740, margin: '0 auto' }}>
            {Array.from({ length: packCount }, (_, slotIndex) => slotIndex).map((slotIndex) => {
              const setCode = setPacks[slotIndex]
              if (setCode) {
                const packImageUrl = getPackImageUrl(setCode)
                return (
                  <div
                    key={slotIndex}
                    data-testid="tray-pack"
                    style={{ width: 100, cursor: 'pointer' }}
                    onClick={() => removeSetPackAt(slotIndex)}
                  >
                    <img src={packImageUrl} alt={setCode} style={{ width: '100%', display: 'block', borderRadius: 8 }} />
                  </div>
                )
              }
              return (
                <div key={slotIndex} data-testid="tray-slot-empty" style={{ width: 100, aspectRatio: '2.5 / 3.5', borderRadius: 8, border: '2px dashed rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)' }} />
              )
            })}
          </div>

          {/* Event Packs ride along below the draft's slots, at half size — opt-in, each drafted
              as its own bonus round after the set packs. */}
          {promoPacks.length > 0 && (
            <div className="chaos-draft-promo-row">
              <span className="chaos-draft-promo-row-label">Plus Event Pack rounds</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.75rem' }}>
                {promoPacks.map((setCode, promoIndex) => (
                  <div
                    key={`${setCode}-${promoIndex}`}
                    style={{ width: 50, cursor: 'pointer' }}
                    onClick={() => removePromoPackAt(promoIndex)}
                  >
                    <img src={getPackImageUrl(setCode)} alt={setCode} style={{ width: '100%', display: 'block', borderRadius: 4 }} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {(selectionError || error) && (
          <div className="error-message" role="alert">{selectionError || error}</div>
        )}

        <div className="chaos-draft-actions">
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
            disabled={!selectionComplete || !selectionValidation.ok || creating}
            onClick={handleCreate}
          >
            {creating ? 'Creating...' : 'Create Chaos'}
          </Button>
        </div>
      </div>
    </div>
  )
}
