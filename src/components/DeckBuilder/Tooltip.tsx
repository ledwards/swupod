// @ts-nocheck
/**
 * Tooltip Component
 *
 * Renders a positioned tooltip overlay.
 */

import type { CSSProperties } from 'react'

export interface TooltipData {
  show: boolean
  x: number
  y: number
  text: string
  alignLeft?: boolean
  position?: 'left' | 'above' | 'below'
  marginRight?: string
}

export interface TooltipProps {
  tooltip: TooltipData
}

export function Tooltip({ tooltip }: TooltipProps) {
  if (!tooltip.show) return null

  // Determine transform based on position
  let transform: string
  let marginTop: string = '0'

  if (tooltip.position === 'below') {
    transform = 'translateX(-50%) translateY(0)'
    marginTop = '8px'
  } else if (tooltip.alignLeft || tooltip.position === 'left') {
    transform = 'translateX(-100%) translateY(-50%)'
  } else {
    // above (default)
    transform = 'translateX(-50%) translateY(-100%)'
    marginTop = '-8px'
  }

  const style: CSSProperties = {
    position: 'fixed',
    left: `${tooltip.x}px`,
    top: `${tooltip.y}px`,
    transform,
    zIndex: 10000,
    pointerEvents: 'none',
    marginTop,
    ...(tooltip.marginRight && { marginRight: tooltip.marginRight })
  }

  return (
    <div className="tooltip" style={style}>
      {tooltip.text}
    </div>
  )
}

export default Tooltip
