// @ts-nocheck
/**
 * AspectIcon Component
 *
 * Renders an aspect icon (Vigilance, Command, Aggression, Cunning, Villainy, Heroism)
 *
 * Usage:
 *   <AspectIcon aspect="Vigilance" />
 *   <AspectIcon aspect="Command" size="lg" />
 *   <AspectIcon aspect="Aggression" size="sm" withLabel />
 */

import './AspectIcon.css'
import type { CSSProperties } from 'react'

type AspectName = 'Command' | 'Villainy' | 'Heroism' | 'Cunning' | 'Vigilance' | 'Aggression'
type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const ASPECT_MAP: Record<AspectName, string> = {
  'Command': 'command',
  'Villainy': 'villainy',
  'Heroism': 'heroism',
  'Cunning': 'cunning',
  'Vigilance': 'vigilance',
  'Aggression': 'aggression'
}

const SIZE_MAP: Record<IconSize, number> = {
  'xs': 12,
  'sm': 16,
  'md': 18,
  'lg': 24,
  'xl': 28
}

export interface AspectIconProps {
  aspect: string
  size?: IconSize
  withLabel?: boolean
  className?: string
  style?: CSSProperties
}

export function AspectIcon({
  aspect,
  size = 'md',
  withLabel = false,
  className = '',
  style = {}
}: AspectIconProps) {
  const aspectName = ASPECT_MAP[aspect as AspectName]
  if (!aspectName) return null

  const iconSize = SIZE_MAP[size] || SIZE_MAP.md

  const icon = (
    <img
      src={`/icons/${aspectName}.png`}
      alt={aspect}
      className={`aspect-icon aspect-icon--${size} ${className}`}
      style={{
        width: `${iconSize}px`,
        height: `${iconSize}px`,
        verticalAlign: 'middle',
        ...style
      }}
    />
  )

  if (withLabel) {
    return (
      <span className={`aspect-icon-with-label aspect-icon-with-label--${size}`}>
        {icon}
        <span className="aspect-icon-label">{aspect}</span>
      </span>
    )
  }

  return icon
}

// Export constants for use elsewhere
export const ASPECTS: AspectName[] = ['Vigilance', 'Command', 'Aggression', 'Cunning', 'Villainy', 'Heroism']
export const ASPECT_NAMES = ASPECT_MAP

export default AspectIcon
