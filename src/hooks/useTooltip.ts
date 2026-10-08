// @ts-nocheck
/**
 * useTooltip Hook
 *
 * Handles tooltip display with delayed show and mobile long press support.
 */

import { useState, useRef, useEffect, useCallback } from 'react';

// === TYPES ===

/** Tooltip state */
interface TooltipState {
  show: boolean;
  text: string;
  x: number;
  y: number;
  alignLeft: boolean;
  position?: 'left' | 'above' | 'below';
}

/** Event with currentTarget that has getBoundingClientRect */
interface TooltipEvent {
  currentTarget: {
    getBoundingClientRect: () => DOMRect;
  };
}

/** Return type for useTooltip hook */
export interface UseTooltipReturn {
  tooltip: TooltipState;
  showTooltip: (text: string, event: TooltipEvent) => void;
  showNavTooltip: (text: string, event: TooltipEvent) => void;
  hideTooltip: () => void;
  handleLongPress: (text: string, event: TooltipEvent) => void;
  cancelLongPress: () => void;
}

// === HOOK ===

export function useTooltip(): UseTooltipReturn {
  const [tooltip, setTooltip] = useState<TooltipState>({
    show: false,
    text: '',
    x: 0,
    y: 0,
    alignLeft: false
  });
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
      }
    };
  }, []);

  // Show tooltip with delay (for cards)
  const showTooltip = useCallback((text: string, event: TooltipEvent) => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }
    tooltipTimeoutRef.current = setTimeout(() => {
      const rect = event.currentTarget.getBoundingClientRect();
      setTooltip({
        show: true,
        text,
        x: rect.left + rect.width / 2,
        y: rect.top - 10,
        alignLeft: false
      });
    }, 1000);
  }, []);

  // Show tooltip immediately (for nav buttons)
  // position: 'left' (default) or 'below'
  const showNavTooltip = useCallback((text: string, event: TooltipEvent, position: 'left' | 'below' = 'left') => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (position === 'below') {
      setTooltip({
        show: true,
        text,
        x: rect.left + rect.width / 2,
        y: rect.bottom,
        alignLeft: false,
        position: 'below'
      });
    } else {
      setTooltip({
        show: true,
        text,
        x: rect.left,
        y: rect.top + rect.height / 2,
        alignLeft: true,
        position: 'left'
      });
    }
  }, []);

  // Hide tooltip
  const hideTooltip = useCallback(() => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }
    setTooltip({ show: false, text: '', x: 0, y: 0, alignLeft: false });
  }, []);

  // Mobile long press handler
  const handleLongPress = useCallback((text: string, event: TooltipEvent) => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile) return;

    longPressTimeoutRef.current = setTimeout(() => {
      const rect = event.currentTarget.getBoundingClientRect();
      setTooltip({
        show: true,
        text,
        x: rect.left + rect.width / 2,
        y: rect.top - 10,
        alignLeft: false
      });
    }, 1000);
  }, []);

  // Cancel long press
  const cancelLongPress = useCallback(() => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  return {
    tooltip,
    showTooltip,
    showNavTooltip,
    hideTooltip,
    handleLongPress,
    cancelLongPress,
  };
}

export default useTooltip;
