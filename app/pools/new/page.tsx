// @ts-nocheck
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { generateSealedBox } from '../../../src/utils/boosterPack'
import { getCachedCards, isCacheInitialized, initializeCardCache } from '../../../src/utils/cardCache'
import { fetchSetCards } from '../../../src/utils/api'
import { getBaseSetCode } from '../../../src/utils/carboniteConstants'
import { savePool } from '../../../src/utils/poolApi'
import { getCyclingPackImageUrls, getRandomPackImageUrls } from '../../../src/utils/packArt'
import { pickRandomWindow } from '../../../src/utils/packWindow'
import { normalizeSealedPackCount, STANDARD_SEALED_PACKS_PER_PLAYER } from '../../../src/utils/sealedPodConfig'
import { nanoid } from 'nanoid'
import SealedPod from '../../../src/components/SealedPod'
import PackOpeningAnimation from '../../../src/components/PackOpeningAnimation'
import '../../../src/App.css'

interface CardType {
  id?: string
  name?: string
  [key: string]: unknown
}

interface PackType {
  cards: CardType[]
  [key: string]: unknown
}

interface PoolData {
  shareId: string
  setCode: string
  cards: CardType[]
  packs: PackType[]
  isPublic: boolean
  boxPacks?: PackType[]
  packIndices?: number[]
}

export default function NewPoolPage() {
  const router = useRouter()
  const [pool, setPool] = useState<PoolData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [setCode, setSetCode] = useState<string | null>(null)
  const [showAnimation, setShowAnimation] = useState(true)
  const [poolReady, setPoolReady] = useState(false)
  const [packImageUrls, setPackImageUrls] = useState<string[]>([])
  // Packs in this pool — 6 by default, 8 when the sealed page passed ?packs=8.
  // Anything else falls back to 6 (normalizeSealedPackCount).
  const [packCount, setPackCount] = useState(STANDARD_SEALED_PACKS_PER_PLAYER)

  useEffect(() => {
    async function createNewPool() {
      try {
        setLoading(true)
        // Get set code from URL query params
        const urlParams = new URLSearchParams(window.location.search)
        const urlSetCode = urlParams.get('set')

        if (!urlSetCode) {
          setError('No set specified')
          setLoading(false)
          setShowAnimation(false)
          return
        }

        // Store set code for animation
        setSetCode(urlSetCode)

        // Pack count comes from the sealed set-selection toggle (6 or 8 only)
        const urlPackCount = normalizeSealedPackCount(urlParams.get('packs'))
        setPackCount(urlPackCount)

        // Initialize card cache if not already initialized
        if (!isCacheInitialized()) {
          try {
            await initializeCardCache()
          } catch (err) {
            console.warn('Failed to initialize card cache, will try API:', err)
          }
        }

        // Load cards for the set - try cache first, then API
        // Strip -CB suffix for carbonite codes (e.g. 'JTL-CB' -> 'JTL')
        const baseCode = getBaseSetCode(urlSetCode)
        let cards: CardType[] = []
        if (isCacheInitialized()) {
          cards = getCachedCards(baseCode)
        }

        // If no cards from cache, try API
        if (cards.length === 0) {
          try {
            cards = await fetchSetCards(baseCode)
          } catch (err) {
            console.error('Failed to fetch cards from API:', err)
          }
        }

        if (cards.length === 0) {
          setError(`No card data available for set ${urlSetCode}. Please ensure cards are loaded in src/data/cards.json or the API is accessible.`)
          setLoading(false)
          setShowAnimation(false)
          return
        }

        // Generate sealed box (24 packs) for randomization support
        const boxPacks = generateSealedBox(cards, urlSetCode)
        // Take the first N packs of the box as the initial display
        const initialIndices = Array.from({ length: urlPackCount }, (_, i) => i)
        const generatedPacks = initialIndices.map(i => boxPacks[i])
        const allCards = generatedPacks.flatMap(pack => pack.cards)

        // Generate share ID client-side using nanoid
        const shareId = nanoid(8)

        // Create pool object immediately
        const poolData: PoolData = {
          shareId,
          setCode: urlSetCode,
          cards: allCards,
          packs: generatedPacks,
          isPublic: false,
          boxPacks,
          packIndices: initialIndices,
        }

        // Update URL immediately without page reload
        window.history.replaceState({}, '', `/pool/${shareId}`)

        // Set pool state - but don't show it yet (wait for animation)
        // Note: Pool is saved when animation completes to capture any randomization
        setPool(poolData)
        setPackImageUrls(getCyclingPackImageUrls(urlSetCode, urlPackCount))
        setPoolReady(true)
        setLoading(false)
      } catch (err) {
        console.error('Failed to create pool:', err)
        setError(err instanceof Error ? err.message : 'Failed to create pool')
        setLoading(false)
      }
    }

    createNewPool()
  }, [router])

  const handleBack = () => {
    router.push('/sealed')
  }

  const handleAnimationComplete = useCallback(() => {
    setShowAnimation(false)

    // Save pool to database now that animation is complete (captures any randomization)
    if (pool) {
      savePool({
        setCode: pool.setCode,
        cards: pool.cards,
        packs: pool.packs,
        isPublic: false,
        shareId: pool.shareId,
        boxPacks: pool.boxPacks,
        packIndices: pool.packIndices,
        flowId: new URLSearchParams(window.location.search).get('flowId'),
      }).then((saved) => {
        // Server should use the same shareId, but handle mismatch just in case
        if (saved && saved.shareId && saved.shareId !== pool.shareId) {
          window.history.replaceState({}, '', `/pool/${saved.shareId}`)
          setPool(prev => prev ? { ...prev, shareId: saved.shareId } : null)
        }
      }).catch((err) => {
        console.error('Failed to save pool to database:', err)
        // Don't show error to user - pool is already displayed
      })
    }
  }, [pool])

  const handleRandomize = useCallback(async () => {
    if (!pool?.boxPacks || !pool?.setCode) return

    // Deal a fresh consecutive window of the same size from the box (physical
    // cut — scattered indices cross collation windows and clump duplicates)
    const windowSize = pool.packs?.length || packCount
    const newIndices = pickRandomWindow(windowSize, pool.boxPacks.length, pool.packIndices?.[0])
    const newPacks = newIndices.map(i => pool.boxPacks![i])
    const newCards = newPacks.flatMap(pack => pack.cards)

    // Randomize pack art variants
    setPackImageUrls(getRandomPackImageUrls(pool.setCode, windowSize))

    // Update pool state with new packs
    setPool(prev => prev ? {
      ...prev,
      packs: newPacks,
      cards: newCards,
      packIndices: newIndices,
    } : null)
  }, [pool?.boxPacks, pool?.setCode, pool?.packs?.length, packCount])

  // Show pack opening animation
  // Gate on packImageUrls being populated so the first paint already has
  // the correct set art. If we render with an empty array, getPackImage()
  // falls back to /pack-images/default-pack.png, which 404s, fires onError,
  // and imperatively hides the <img> — leaving the dark fallback rectangles
  // even after the right URLs land in a later render.
  if (showAnimation && setCode && packImageUrls.length > 0) {
    return (
      <PackOpeningAnimation
        packCount={packCount}
        packImageUrls={packImageUrls}
        cardBackUrl="/card-images/card-back.png"
        onComplete={handleAnimationComplete}
        setCode={setCode}
        packs={pool?.packs || null}
        onRandomize={handleRandomize}
        hasBox={Boolean(pool?.boxPacks)}
      />
    )
  }

  if (error) {
    return (
      <div className="app">
        <div className="error">
          <h2>Error</h2>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  // Still loading pool data
  if (loading || !poolReady || !pool) {
    return (
      <div className="app">
        {/* Blank screen while loading */}
      </div>
    )
  }

  return (
    <div className="app">
      <SealedPod
        setCode={pool.setCode}
        onBack={handleBack}
        onBuildDeck={(cards: CardType[], setCode: string) => {
          router.push(`/pool/${pool.shareId}/deck`)
        }}
        initialPacks={pool.packs}
        shareId={pool.shareId}
      />
    </div>
  )
}
