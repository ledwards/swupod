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

/**
 * Generate N unique random indices from 0 to max-1
 */
function generateRandomIndices(count: number, max: number): number[] {
  const indices: number[] = []
  const available = Array.from({ length: max }, (_, i) => i)

  for (let i = 0; i < count; i++) {
    const randomIndex = Math.floor(Math.random() * available.length)
    indices.push(available[randomIndex])
    available.splice(randomIndex, 1)
  }

  // Sort indices so packs appear in box order
  return indices.sort((a, b) => a - b)
}

export default function NewPoolPage() {
  const router = useRouter()
  const [pool, setPool] = useState<PoolData | null>(null)
  const [isPoolSaved, setIsPoolSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [setCode, setSetCode] = useState<string | null>(null)
  const [showAnimation, setShowAnimation] = useState(true)
  const [poolReady, setPoolReady] = useState(false)
  const [packImageUrls, setPackImageUrls] = useState<string[]>([])

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
        // Take first 6 packs as the initial display
        const initialIndices = [0, 1, 2, 3, 4, 5]
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
        setIsPoolSaved(false)
        setPackImageUrls(getCyclingPackImageUrls(urlSetCode, 6))
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
      }).then((saved) => {
        setIsPoolSaved(true)
        // Server should use the same shareId, but handle mismatch just in case
        if (saved && saved.shareId && saved.shareId !== pool.shareId) {
          window.history.replaceState({}, '', `/pool/${saved.shareId}`)
          setPool(prev => prev ? { ...prev, shareId: saved.shareId } : null)
        }
      }).catch((err) => {
        setIsPoolSaved(false)
        console.error('Failed to save pool to database:', err)
        // Don't show error to user - pool is already displayed
      })
    }
  }, [pool])

  const handleRandomize = useCallback(async () => {
    if (!pool?.boxPacks || !pool?.setCode) return

    // Generate new random indices from the 24-pack box
    const newIndices = generateRandomIndices(6, pool.boxPacks.length)
    const newPacks = newIndices.map(i => pool.boxPacks![i])
    const newCards = newPacks.flatMap(pack => pack.cards)

    // Randomize pack art variants
    setPackImageUrls(getRandomPackImageUrls(pool.setCode, 6))

    // Update pool state with new packs
    setPool(prev => prev ? {
      ...prev,
      packs: newPacks,
      cards: newCards,
      packIndices: newIndices,
    } : null)
  }, [pool?.boxPacks, pool?.setCode])

  // Show pack opening animation
  if (showAnimation && setCode) {
    return (
      <PackOpeningAnimation
        packCount={6}
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
        onBuildDeck={async () => {
          let shareId = pool.shareId

          if (!isPoolSaved) {
            try {
              const saved = await savePool({
                setCode: pool.setCode,
                cards: pool.cards,
                packs: pool.packs,
                isPublic: false,
                shareId: pool.shareId,
                boxPacks: pool.boxPacks,
                packIndices: pool.packIndices,
              })
              if (saved?.shareId) {
                shareId = saved.shareId
                setPool(prev => prev ? { ...prev, shareId } : null)
              }
              setIsPoolSaved(true)
            } catch (err) {
              console.error('Failed to save pool before opening deck builder:', err)
              setError('Unable to save your pool right now. Please try again in a moment.')
              return
            }
          }

          router.push(`/pool/${shareId}/deck`)
        }}
        initialPacks={pool.packs}
      />
    </div>
  )
}
