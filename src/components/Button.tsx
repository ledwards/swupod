// @ts-nocheck
'use client'
import './Button.css'
import { useAlphaUi } from '../contexts/AlphaUiContext'
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

// Preset glows name RGB channel tokens, so under the site theme they take the
// theme's colors: green → accent, blue → highlight, red → danger, yellow → warning.
const GLOW_COLORS: Record<GlowColorName, string> = {
  green: 'var(--pt-glow-primary-rgb)',
  red: 'var(--pt-glow-danger-rgb)',
  blue: 'var(--pt-glow-interactive-rgb)',
  yellow: 'var(--pt-gold-warning-rgb)',
}

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  variant?: ButtonVariant
  size?: ButtonSize
  active?: boolean
  textOnly?: boolean
  glowColor?: GlowColorName | null
  style?: CSSProperties & {
    '--glow-rgb'?: string
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
  // Alpha standardizes every back button to "← Back"; everyone else keeps the
  // caller's own label.
  const { enabled: alphaUi } = useAlphaUi()
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
    customStyle['--glow-rgb'] = GLOW_COLORS[glowColor] || GLOW_COLORS.blue
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
      // Toggles expose their state to assistive tech, and the site theme styles the pressed state from it.
      aria-pressed={variant === 'toggle' ? active : undefined}
      {...rest}
    >
      {variant === 'back' && alphaUi ? <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg><span>Back</span></> : children}
    </button>
  )
}

export default Button
