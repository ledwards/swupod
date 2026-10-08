// @ts-nocheck
/**
 * useIsMobile Hook
 *
 * Detects if the current device is mobile based on screen width and touch capability.
 * Replaces the repeated pattern:
 * window.innerWidth <= 768 || 'ontouchstart' in window || navigator.maxTouchPoints > 0
 *
 * @returns True if device is mobile/touch-enabled
 */

import { useState, useEffect } from 'react';

// === TYPES ===

/** Options for useIsMobile hook */
interface UseIsMobileOptions {
  /** Re-check on window resize (default: true) */
  watchResize?: boolean;
}

// === HELPER ===

/**
 * Check if current device is mobile
 * Uses screen width and touch capability detection
 *
 * @returns True if mobile device
 */
function checkIsMobile(): boolean {
  if (typeof window === 'undefined') return false;

  return (
    window.innerWidth <= 768 ||
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0
  );
}

// === HOOK ===

/**
 * Hook to detect mobile device
 *
 * @param options - Options
 * @returns True if mobile device
 *
 * @example
 * function MyComponent() {
 *   const isMobile = useIsMobile()
 *
 *   return (
 *     <div>
 *       {isMobile ? 'Mobile view' : 'Desktop view'}
 *     </div>
 *   )
 * }
 */
export function useIsMobile(options: UseIsMobileOptions = {}): boolean {
  const { watchResize = true } = options;
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Initial check
    setIsMobile(checkIsMobile());

    if (!watchResize) return;

    // Watch for resize
    const handleResize = () => {
      setIsMobile(checkIsMobile());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [watchResize]);

  return isMobile;
}

/**
 * Non-hook version for use outside of React components
 * Use this when you need to check mobile status in event handlers
 *
 * @returns True if mobile device
 */
export function isMobileDevice(): boolean {
  return checkIsMobile();
}

export default useIsMobile;
