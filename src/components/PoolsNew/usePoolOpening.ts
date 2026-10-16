'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { useAuth } from '../../contexts/AuthContext'
import { generateSealedBox } from '../../utils/boosterPack'
import { getCachedCards, isCacheInitialized, initializeCardCache } from '../../utils/cardCache'
import { fetchSetCards } from '../../utils/api'
import { getBaseSetCode } from '../../utils/carboniteConstants'
import { savePool } from '../../utils/poolApi'
import { getCyclingPackImageUrls, getRandomPackImageUrls } from '../../utils/packArt'
import { pickRandomWindow } from '../../utils/packWindow'
import { normalizeSealedPackCount, STANDARD_SEALED_PACKS_PER_PLAYER } from '../../utils/sealedPodConfig'
import type { PoolPack } from '../../services/pools/poolPage'

export interface OpeningPool {
  generationId?: string
  shareId: string
  setCode: string
  cards: PoolPack['cards']
  packs: PoolPack[]
  boxPacks?: PoolPack[]
  packIndices?: number[]
  createdAt?: string
  owner?: { id: string; username?: string | null } | null
}

const flowId = () => new URLSearchParams(window.location.search).get('flowId')

/**
 * Opening a sealed pool on /pools/new (alpha): the same generation as the
 * legacy page. Signed in, the server deals and certifies a 24-pack box
 * (prepare → open → finalize); signed out (local previews only), the box is
 * dealt in the browser and saved when the opening ends. Shuffle deals a fresh
 * consecutive window of the same box.
 */
export function usePoolOpening() {
  const { user, loading: authLoading } = useAuth() as { user: { id?: string } | null; loading: boolean }
  const started = useRef(false)
  const finalizing = useRef(false)
  const [pool, setPool] = useState<OpeningPool | null>(null)
  const [setCode, setSetCode] = useState<string | null>(null)
  const [packCount, setPackCount] = useState(STANDARD_SEALED_PACKS_PER_PLAYER)
  const [packImageUrls, setPackImageUrls] = useState<string[]>([])
  const [opening, setOpening] = useState(true)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading || started.current) return
    started.current = true
    const create = async () => {
      try {
        const params = new URLSearchParams(window.location.search)
        const code = params.get('set')
        if (!code) { setError('No set specified'); setOpening(false); setBusy(false); return }
        setSetCode(code)
        const count = normalizeSealedPackCount(params.get('packs'))
        setPackCount(count)

        if (user) {
          const requestId = params.get('generation') || crypto.randomUUID()
          params.set('generation', requestId)
          window.history.replaceState({}, '', `/pools/new?${params}`)
          const res = await fetch('/api/sealed/generate', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'prepare', setCode: code, packCount: count, requestId }),
          })
          const generated = await res.json()
          if (!res.ok) throw new Error(generated.error || 'Could not generate a saved pool.')
          const start = Number(params.get('windowStart') || 0)
          if (Number.isInteger(start) && start >= 0 && start + count <= 24) {
            generated.packIndices = Array.from({ length: count }, (_, i) => start + i)
            generated.packs = generated.packIndices.map((i: number) => generated.boxPacks[i])
            generated.cards = generated.packs.flatMap((p: PoolPack) => p.cards)
          }
          setPool(generated)
          setPackImageUrls(getCyclingPackImageUrls(code, count))
          setBusy(false)
          return
        }

        if (!isCacheInitialized()) {
          try { await initializeCardCache() } catch (err) { console.warn('Failed to initialize card cache, will try API:', err) }
        }
        const base = getBaseSetCode(code)
        let cards = isCacheInitialized() ? getCachedCards(base) : []
        if (!cards.length) {
          try { cards = await fetchSetCards(base) } catch (err) { console.error('Failed to fetch cards from API:', err) }
        }
        if (!cards.length) {
          setError(`No card data available for set ${code}.`)
          setOpening(false); setBusy(false)
          return
        }
        const boxPacks = generateSealedBox(cards, code) as unknown as PoolPack[]
        const packIndices = Array.from({ length: count }, (_, i) => i)
        const packs = packIndices.map(i => boxPacks[i]!)
        const shareId = nanoid(8)
        window.history.replaceState({}, '', `/pools/${shareId}`)
        setPool({ shareId, setCode: code, cards: packs.flatMap(p => p.cards), packs, boxPacks, packIndices })
        setPackImageUrls(getCyclingPackImageUrls(code, count))
        setBusy(false)
      } catch (err) {
        console.error('Failed to create pool:', err)
        setError(err instanceof Error ? err.message : 'Failed to create pool')
        setBusy(false)
      }
    }
    void create()
  }, [authLoading, user])

  /** The opening ended (or was skipped): save the pool as dealt. */
  const finish = useCallback(async () => {
    if (pool?.generationId) {
      if (finalizing.current) return
      finalizing.current = true
      setOpening(false); setBusy(true); setError(null)
      try {
        const res = await fetch('/api/sealed/generate', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'finalize', generationId: pool.generationId, windowStart: pool.packIndices?.[0] ?? 0, flowId: flowId() }),
        })
        const saved = await res.json()
        if (!res.ok) throw new Error(saved.error || 'Could not save this pool.')
        setPool(saved)
        window.history.replaceState({}, '', `/pools/${saved.shareId}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save this pool. Retry safely.')
      } finally {
        finalizing.current = false
        setBusy(false)
      }
      return
    }
    setOpening(false)
    if (!pool) return
    savePool({ setCode: pool.setCode, cards: pool.cards as never, packs: pool.packs as never, isPublic: false, shareId: pool.shareId,
      boxPacks: pool.boxPacks as never, ...(pool.packIndices ? { packIndices: pool.packIndices } : {}), flowId: flowId() })
      .then(saved => {
        if (saved?.shareId && saved.shareId !== pool.shareId) {
          window.history.replaceState({}, '', `/pools/${saved.shareId}`)
          setPool(prev => (prev ? { ...prev, shareId: saved.shareId } : null))
        }
      })
      .catch(err => console.error('Failed to save pool to database:', err))
  }, [pool])

  /** Shuffle Packs: a fresh consecutive window of the same box, with fresh pack art. */
  const shuffle = useCallback(async () => {
    if (!pool?.boxPacks || !pool.setCode) return
    const size = pool.packs?.length || packCount
    const indices = pickRandomWindow(size, pool.boxPacks.length, pool.packIndices?.[0])
    const packs = indices.map(i => pool.boxPacks![i]!)
    if (pool.generationId) {
      const params = new URLSearchParams(window.location.search)
      params.set('windowStart', String(indices[0]))
      window.history.replaceState({}, '', `/pools/new?${params}`)
    }
    setPackImageUrls(getRandomPackImageUrls(pool.setCode, size))
    setPool(prev => (prev ? { ...prev, packs, cards: packs.flatMap(p => p.cards), packIndices: indices } : null))
  }, [pool, packCount])

  return { pool, setCode, packCount, packImageUrls, opening, busy, error, finish, shuffle }
}
