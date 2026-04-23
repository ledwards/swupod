// @ts-nocheck
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import DeckBuilder from '../../../src/components/DeckBuilder'
import { fetchSetCards } from '../../../src/utils/api'
import { getCachedCards, initializeCardCache, isCacheInitialized } from '../../../src/utils/cardCache'
import { getBaseSetCode } from '../../../src/utils/carboniteConstants'
import { parseDeckBuilderState } from '../../../src/utils/deckBuilderState'
import { buildInfiniteDeckbuilderPool } from '../../../src/utils/infiniteDeckbuilder'
import { loadPool, savePool, updatePool } from '../../../src/utils/poolApi'
import '../../../src/App.css'

const LOCAL_STORAGE_PREFIX = 'deckbuilderModeState:'
const DEFAULT_POOL_NAME = 'Custom Limited Deck'

function createLimitedDeckSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `limited-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function getLocalStorageKey(setCode: string, sessionId: string): string {
  return `${LOCAL_STORAGE_PREFIX}${setCode}:${sessionId}`
}

export default function DeckbuilderBuildPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const setCode = searchParams.get('set')
  const sessionId = searchParams.get('session')
  const playShareId = searchParams.get('playShareId')
  const [cards, setCards] = useState([])
  const [savedState, setSavedState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPlayShareId, setCurrentPlayShareId] = useState<string | null>(playShareId)
  const pendingStateRef = useRef<Record<string, unknown> | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!setCode || sessionId || playShareId) return

    const nextSessionId = createLimitedDeckSessionId()
    router.replace(`/deckbuilder/build?set=${encodeURIComponent(setCode)}&session=${encodeURIComponent(nextSessionId)}`)
  }, [router, setCode, sessionId, playShareId])

  const storageSessionId = sessionId || playShareId || null
  const localStorageKey = useMemo(() => (
    setCode && storageSessionId ? getLocalStorageKey(setCode, storageSessionId) : null
  ), [setCode, storageSessionId])

  useEffect(() => {
    async function loadDeckbuilderMode() {
      if (!setCode) {
        setError('No set specified')
        setLoading(false)
        return
      }

      if (!localStorageKey || !storageSessionId) {
        return
      }

      try {
        setLoading(true)
        if (!isCacheInitialized()) {
          await initializeCardCache()
        }

        const baseSetCode = getBaseSetCode(setCode)
        let loadedSetCards = getCachedCards(baseSetCode)
        if (loadedSetCards.length === 0) {
          loadedSetCards = await fetchSetCards(baseSetCode)
        }

        if (loadedSetCards.length === 0) {
          throw new Error(`No card data available for set ${setCode}`)
        }

        const infinitePool = buildInfiniteDeckbuilderPool(baseSetCode, loadedSetCards)
        setCards(infinitePool)

        let nextSavedState = localStorage.getItem(localStorageKey)

        if (!nextSavedState && playShareId) {
          try {
            const existingPool = await loadPool(playShareId)
            if (existingPool?.deckBuilderState) {
              const stateFromPool = parseDeckBuilderState(existingPool.deckBuilderState)
              nextSavedState = JSON.stringify({
                ...stateFromPool,
                poolName: stateFromPool?.poolName || DEFAULT_POOL_NAME,
                playShareId,
                sessionId: stateFromPool?.sessionId || storageSessionId,
              })
              setCurrentPlayShareId(stateFromPool?.playShareId || playShareId || null)
              localStorage.setItem(localStorageKey, nextSavedState)
            }
          } catch (poolError) {
            console.warn('Failed to load existing Limited Deckbuilder pool:', poolError)
          }
        }

        if (!nextSavedState) {
          nextSavedState = JSON.stringify({
            poolName: DEFAULT_POOL_NAME,
            playShareId: playShareId || null,
            sessionId: storageSessionId,
          })
          setCurrentPlayShareId(playShareId || null)
          localStorage.setItem(localStorageKey, nextSavedState)
        } else {
          const parsedState = parseDeckBuilderState(nextSavedState)
          const normalizedState = {
            ...parsedState,
            poolName: parsedState?.poolName || DEFAULT_POOL_NAME,
            playShareId: parsedState?.playShareId || playShareId || null,
            sessionId: parsedState?.sessionId || storageSessionId,
          }
          setCurrentPlayShareId(normalizedState.playShareId || null)
          nextSavedState = JSON.stringify(normalizedState)
          localStorage.setItem(localStorageKey, nextSavedState)
        }

        setSavedState(nextSavedState)
      } catch (err) {
        console.error('Failed to load Limited Deckbuilder:', err)
        setError(err instanceof Error ? err.message : 'Failed to load Limited Deckbuilder')
      } finally {
        setLoading(false)
      }
    }

    loadDeckbuilderMode()
  }, [setCode, localStorageKey, playShareId, storageSessionId])

  const handleRequestPlay = useCallback(async (deckBuilderState) => {
    if (!setCode) {
      throw new Error('No set selected')
    }

    const nextDeckBuilderState = {
      ...deckBuilderState,
      poolName: deckBuilderState?.poolName || DEFAULT_POOL_NAME,
      playShareId: deckBuilderState?.playShareId || playShareId || null,
      sessionId: deckBuilderState?.sessionId || storageSessionId,
      isInfinitePool: true,
    }

    const existingShareId = nextDeckBuilderState.playShareId || null

    if (existingShareId) {
      try {
        await updatePool(existingShareId, {
          deckBuilderState: nextDeckBuilderState,
          hidden: false,
          isPublic: false,
        })
        setCurrentPlayShareId(existingShareId)
        return existingShareId
      } catch (err) {
        console.warn('Failed to update placeholder pool, creating a new one instead:', err)
      }
    }

    const createdPool = await savePool({
      setCode,
      cards: [],
      packs: [],
      deckBuilderState: nextDeckBuilderState,
      isPublic: false,
      hidden: false,
      poolType: 'sealed',
    })

    setCurrentPlayShareId(createdPool.shareId)
    return createdPool.shareId
  }, [playShareId, setCode, storageSessionId])

  const handleDeckStateChange = useCallback((deckBuilderState: Record<string, unknown>) => {
    const normalizedDeckBuilderState = {
      ...deckBuilderState,
      poolName: deckBuilderState?.poolName || DEFAULT_POOL_NAME,
      playShareId: deckBuilderState?.playShareId || currentPlayShareId || null,
      sessionId: deckBuilderState?.sessionId || storageSessionId,
      isInfinitePool: true,
    }

    pendingStateRef.current = normalizedDeckBuilderState

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    if (!currentPlayShareId) {
      return
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (!pendingStateRef.current) return

      try {
        await updatePool(currentPlayShareId, {
          deckBuilderState: pendingStateRef.current,
          hidden: false,
          isPublic: false,
        })
      } catch (err) {
        console.error('Failed to save Limited Deckbuilder state:', err)
      }
    }, 2000)
  }, [currentPlayShareId, storageSessionId])

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }

      if (pendingStateRef.current && currentPlayShareId) {
        updatePool(currentPlayShareId, {
          deckBuilderState: pendingStateRef.current,
          hidden: false,
          isPublic: false,
        }).catch(() => {})
      }
    }
  }, [currentPlayShareId])

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!pendingStateRef.current || !currentPlayShareId) return

      const data = JSON.stringify({
        shareId: currentPlayShareId,
        deckBuilderState: pendingStateRef.current,
      })
      navigator.sendBeacon('/api/pools/save-state', data)
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [currentPlayShareId])

  if (loading) {
    return (
      <div className="app">
        <div className="loading"></div>
      </div>
    )
  }

  if (error || !setCode || !localStorageKey || !storageSessionId) {
    return (
      <div className="app">
        <div className="error">
          <h2>Error</h2>
          <p>{error || 'Missing set code or session'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <DeckBuilder
        cards={cards}
        setCode={setCode}
        onBack={() => router.push('/deckbuilder')}
        savedState={savedState}
        onStateChange={handleDeckStateChange}
        mode="infinite"
        localStorageKey={localStorageKey}
        sessionId={storageSessionId}
        onRequestPlay={handleRequestPlay}
        poolName={DEFAULT_POOL_NAME}
      />
    </div>
  )
}
