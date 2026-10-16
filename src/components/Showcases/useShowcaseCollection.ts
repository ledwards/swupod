'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { initializeCardCache, getCachedCards } from '@/src/utils/cardCache'
import { getAllSetCodes } from '@/src/utils/setConfigs'
import { clampToTable, scatterPositions, type CardPosition, type ShowcaseCardData, type ShowcaseLeader, type Size } from './showcaseTable'

/** The viewer's Showcase leaders, the card data behind them, and how many Showcase leaders exist. */
export function useShowcaseData(userId: string | null | undefined) {
  const [showcases, setShowcases] = useState<ShowcaseLeader[]>([])
  const [cards, setCards] = useState<Record<string, ShowcaseCardData>>({})
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    ;(async () => {
      try {
        await initializeCardCache()
        const map: Record<string, ShowcaseCardData> = {}
        const unique = new Set<string>()
        for (const setCode of getAllSetCodes()) {
          for (const card of (getCachedCards(setCode) || []) as ShowcaseCardData[]) {
            map[card.id] = card
            if (card.isLeader && card.variantType === 'Showcase') unique.add(`${card.name}|${card.subtitle || ''}`)
          }
        }
        const res = await fetch(`/api/users/${userId}/showcase-leaders`)
        const result = res.ok ? await res.json() : null
        if (cancelled) return
        setCards(map)
        setTotal(unique.size)
        setShowcases(result?.data?.showcaseLeaders || result?.showcaseLeaders || [])
      } catch (error) {
        console.error('Failed to fetch showcases:', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [userId])

  return { showcases, cards, total, loading }
}

const cardSize = (): Size => (window.innerWidth <= 768 ? { width: 220, height: 157 } : { width: 294, height: 210 })

/**
 * Cards scattered on a table you can rearrange: drag to move (mouse or
 * touch), click or tap to flip. Positions are relative to the table element.
 */
export function useShowcaseTable(ids: string[], tableRef: RefObject<HTMLElement | null>) {
  const [positions, setPositions] = useState<Record<string, CardPosition>>({})
  const [flipped, setFlipped] = useState<Record<string, boolean>>({})
  const [size, setSize] = useState<Size>({ width: 294, height: 210 })
  const [tableHeight, setTableHeight] = useState(720)
  const [dragging, setDragging] = useState<string | null>(null)
  const [tilt, setTilt] = useState(0)
  const drag = useRef({ id: '', dx: 0, dy: 0, lastX: 0, startX: 0, startY: 0, moved: false })
  const key = ids.join(',')

  useEffect(() => {
    const table = tableRef.current
    if (!table || !ids.length) return
    const card = cardSize()
    const cols = Math.max(1, Math.ceil(Math.sqrt(ids.length)))
    const rows = Math.ceil(ids.length / cols)
    const height = Math.max(card.width <= 220 ? 560 : 720, rows * (card.height + 24))
    setSize(card)
    setTableHeight(height)
    setPositions(scatterPositions(ids, { width: table.clientWidth, height }, card))
  }, [key, tableRef])

  const onPointerDown = useCallback((id: string, e: ReactPointerEvent<HTMLElement>) => {
    const table = tableRef.current
    const pos = positions[id]
    if (!table || !pos) return
    const rect = table.getBoundingClientRect()
    drag.current = { id, dx: e.clientX - rect.left - pos.x, dy: e.clientY - rect.top - pos.y, lastX: e.clientX, startX: e.clientX, startY: e.clientY, moved: false }
    setDragging(id)
    setTilt(0)
    setPositions(prev => {
      const top = Math.max(0, ...Object.values(prev).map(p => p.zIndex))
      return { ...prev, [id]: { ...prev[id]!, zIndex: top + 1 } }
    })
  }, [positions, tableRef])

  useEffect(() => {
    if (!dragging) return
    const move = (e: PointerEvent) => {
      const table = tableRef.current
      if (!table) return
      const d = drag.current
      if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return
      d.moved = true
      setTilt(Math.max(-8, Math.min(8, (e.clientX - d.lastX) * 0.3)))
      d.lastX = e.clientX
      const rect = table.getBoundingClientRect()
      const next = clampToTable({ x: e.clientX - rect.left - d.dx, y: e.clientY - rect.top - d.dy }, { width: rect.width, height: rect.height }, size)
      setPositions(prev => ({ ...prev, [d.id]: { ...prev[d.id]!, ...next } }))
    }
    const end = () => { setDragging(null); setTilt(0) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [dragging, size, tableRef])

  /** A click after a drag is the drop, not a flip. */
  const onClick = useCallback((id: string) => {
    if (drag.current.id === id && drag.current.moved) {
      drag.current.moved = false
      return
    }
    setFlipped(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  return { positions, flipped, size, tableHeight, dragging, tilt, onPointerDown, onClick }
}
