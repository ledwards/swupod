// @ts-nocheck
import './Button.css'
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'

/**
 * Reusable Button Component
 *
 * Usage:
 *   <Button variant="primary" onClick={handleClick}>Save</Button>
 *   <Button variant="danger" size="sm">Delete</Button>
 *   <Button variant="back" onClick={goBack}>← Back</Button>
 *   <Button variant="icon">🔍</Button>
 *   <Button variant="toggle" active={isActive}>Sort</Button>
 *   <Button variant="primary" textOnly>Add All</Button>
 *   <Button variant="warning">Action Required</Button>
 *   <Button glowColor="blue">Custom Blue Glow</Button>
 *
 * Props:
 *   - variant: 'primary' | 'danger' | 'back' | 'secondary' | 'discord' | 'icon' | 'toggle' | 'interactive' | 'warning'
 *   - size: 'xs' | 'sm' | 'md' | 'lg' (default: 'md') - xs matches icon button height (28px)
 *   - disabled: boolean
 *   - active: boolean - for toggle variant, shows active state
 *   - textOnly: boolean - renders as text-only button (no background/border)
 *   - glowColor: 'green' | 'red' | 'blue' | 'yellow' - custom glow color on hover (overrides variant)
 *   - className: string - additional classes
 *   - children: button content
 *   - ...rest: passed to underlying button element
 */

type ButtonVariant = 'primary' | 'danger' | 'back' | 'secondary' | 'discord' | 'icon' | 'toggle' | 'interactive' | 'warning'
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'
type GlowColorName = 'green' | 'red' | 'blue' | 'yellow'

interface GlowColor {
  r: number
  g: number
  b: number
}

// Preset glow colors
const GLOW_COLORS: Record<GlowColorName, GlowColor> = {
  green: { r: 0, g: 255, b: 0 },
  red: { r: 255, g: 0, b: 0 },
  blue: { r: 33, g: 150, b: 243 },
  yellow: { r: 255, g: 200, b: 0 },
}

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  variant?: ButtonVariant
  size?: ButtonSize
  active?: boolean
  textOnly?: boolean
  glowColor?: GlowColorName | null
  style?: CSSProperties & {
    '--glow-r'?: number
    '--glow-g'?: number
    '--glow-b'?: number
  }
  children?: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  disabled = false,
  active = false,
  textOnly = false,
  glowColor = null,
  className = '',
  style = {},
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    `btn--${variant}`,
    `btn--${size}`,
    disabled ? 'btn--disabled' : '',
    active ? 'btn--active' : '',
    textOnly ? 'btn--text-only' : '',
    glowColor ? 'btn--custom-glow' : '',
    className
  ].filter(Boolean).join(' ')

  // Build custom glow style if glowColor is specified
  let customStyle: ButtonProps['style'] = { ...style }
  if (glowColor) {
    const color = GLOW_COLORS[glowColor] || GLOW_COLORS.blue
    customStyle['--glow-r'] = color.r
    customStyle['--glow-g'] = color.g
    customStyle['--glow-b'] = color.b
  }

  return (
    <button
      // A bare <button> defaults to type="submit", so any Button inside a form
      // silently submits it — that is what made the creator page reload when
      // you pressed Record. Callers that genuinely want to submit can still
      // pass type="submit" through ...rest, which comes after this.
      type="button"
      className={classes}
      disabled={disabled}
      style={glowColor ? customStyle : style}
      {...rest}
    >
      {children}
    </button>
  )
}

export default Button
