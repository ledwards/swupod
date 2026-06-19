import { useCallback, useEffect, useRef, useState } from 'react'

export interface ElementSize {
  width: number
  height: number
}

export function useElementSize<T extends HTMLElement = HTMLElement>(debounceMs = 120) {
  const [element, setElement] = useState<T | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 })

  const ref = useCallback((node: T | null) => {
    setElement(node)
  }, [])

  useEffect(() => {
    if (!element || typeof window === 'undefined' || typeof ResizeObserver === 'undefined') {
      return undefined
    }

    const measure = () => {
      const rect = element.getBoundingClientRect()
      const styles = window.getComputedStyle(element)
      const paddingX = parseFloat(styles.paddingLeft || '0') + parseFloat(styles.paddingRight || '0')
      const paddingY = parseFloat(styles.paddingTop || '0') + parseFloat(styles.paddingBottom || '0')
      setSize({
        width: Math.max(0, rect.width - paddingX),
        height: Math.max(0, rect.height - paddingY),
      })
    }

    const scheduleMeasure = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(measure, debounceMs)
    }

    measure()
    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(element)

    return () => {
      observer.disconnect()
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [debounceMs, element])

  return [ref, size] as const
}

export default useElementSize
