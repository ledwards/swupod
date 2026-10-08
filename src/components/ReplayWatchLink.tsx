'use client'

import type { ReactNode } from 'react'
import './ReplayWatchLink.css'
import Button from './Button'

interface ReplayWatchLinkProps {
  onClick?: () => void
  disabled?: boolean
  href?: string
  children?: ReactNode
  className?: string
  target?: string
  rel?: string
  ariaLabel?: string
}

export function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="13" height="13">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function classNames(className?: string): string {
  return ['your-stats-watch-btn', 'your-stats-replay-watch-inline', className]
    .filter(Boolean)
    .join(' ')
}

export default function ReplayWatchLink({
  href,
  onClick,
  disabled,
  children = 'Watch',
  className,
  target = '_blank',
  rel = 'noopener noreferrer',
  ariaLabel,
}: ReplayWatchLinkProps) {
  const content = (
    <>
      <PlayGlyph />
      {children}
    </>
  )

  if (onClick) {
    return <Button variant="interactive" size="sm" className={classNames(className)} onClick={onClick} disabled={disabled} aria-label={ariaLabel}>{content}</Button>
  }

  if (!href) {
    return (
      <span className={classNames(className)} aria-label={ariaLabel}>
        {content}
      </span>
    )
  }

  return (
    <a
      className={classNames(className)}
      href={href}
      target={target}
      rel={rel}
      aria-label={ariaLabel}
    >
      {content}
    </a>
  )
}
