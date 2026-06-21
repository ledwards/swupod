'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * useElementSize — measure an element's content box and re-emit on resize so a
 * consumer can re-fit (e.g. the slideshow stage refitting card rows when the
 * window or container changes). Observes the ref'd element via ResizeObserver
 * and debounces updates (~120ms) so a drag-resize doesn't thrash the consumer
 * every frame.
 *
 * Return shape — `{ ref, width, height }`:
 *   const { ref, width, height } = useElementSize<HTMLDivElement>()
 *   return <div ref={ref}>{width > 0 && <Stage width={width} height={height} />}</div>
 * The object form reads cleanly at the call site and lets the consumer pass
 * `{ width, height }` straight into a fit util.
 *
 * SSR / jsdom safe: returns `{ width: 0, height: 0 }` before the first
 * measurement and never throws when ResizeObserver is undefined (feature-detected).
 */
export interface ElementSize {
  width: number
  height: number
}

const DEFAULT_DEBOUNCE_MS = 120

export function useElementSize<T extends HTMLElement = HTMLDivElement>(
  opts?: { debounceMs?: number },
): { ref: React.RefObject<T | null>; width: number; height: number } {
  const debounceMs = opts?.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const ref = useRef<T>(null)
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof ResizeObserver === 'undefined') {
      // Feature-detect: never throw in SSR/jsdom. Take a one-shot measurement
      // from getBoundingClientRect so consumers still get real dimensions when
      // available, then bail (no live updates without the observer).
      const rect = el.getBoundingClientRect()
      setSize({ width: rect.width, height: rect.height })
      return
    }

    let timer: ReturnType<typeof setTimeout> | undefined

    const apply = (width: number, height: number) => {
      // Only re-render when a dimension actually changed — avoids redundant
      // updates when the observer fires for an unrelated reason.
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      )
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      // Measure the container's content box, not its images. contentRect is the
      // content box; fall back to getBoundingClientRect on older engines.
      const box = entry.contentRect
      const width = box ? box.width : el.getBoundingClientRect().width
      const height = box ? box.height : el.getBoundingClientRect().height

      if (debounceMs <= 0) {
        apply(width, height)
        return
      }
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => apply(width, height), debounceMs)
    })

    observer.observe(el)
    return () => {
      if (timer) clearTimeout(timer)
      observer.disconnect()
    }
  }, [debounceMs])

  return { ref, width: size.width, height: size.height }
}

export default useElementSize
