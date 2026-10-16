/**
 * ThemedPage (alpha): the shell for small themed pages. The title goes to the
 * shared site header through SiteTitle; the body is a centred column; the
 * shared footer sits at the viewport bottom on short pages and follows the
 * content on long ones. No hooks, so a server page can render it directly.
 *
 *   <ThemedPage title="Admin" subtitle="Access grants and creator invites">
 *     <ThemedPanel label="Grant Access">…</ThemedPanel>
 *   </ThemedPage>
 */
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react'
import { SiteTitle } from '../SiteTheme'
import SiteFooter from '../SiteFooter'
import './themed-page.css'

export function ThemedPage({
  title,
  subtitle,
  narrow = false,
  center = false,
  className = '',
  busy,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  /** 720px column instead of 1160px. */
  narrow?: boolean
  /** Centre a single block vertically (maintenance). */
  center?: boolean
  className?: string
  busy?: boolean
  children: ReactNode
}) {
  const classes = ['tpage', narrow ? 'tpage--narrow' : '', center ? 'tpage--center' : '', className]
    .filter(Boolean)
    .join(' ')
  return (
    <main className={classes} aria-busy={busy || undefined}>
      <SiteTitle subtitle={subtitle}>{title}</SiteTitle>
      <div className="tpage-body">{children}</div>
      <SiteFooter />
    </main>
  )
}

/** An opaque panel; with `label`, the title sits on the top border. */
export function ThemedPanel({
  label,
  className = '',
  as: Tag = 'section',
  children,
  ...rest
}: {
  label?: ReactNode
  className?: string
  as?: 'section' | 'div' | 'form'
  children: ReactNode
} & Omit<ComponentPropsWithoutRef<'form'>, 'children' | 'className'>) {
  const Element = Tag as ElementType
  const classes = ['tpage-panel', label ? 'tpage-panel--labeled' : '', className].filter(Boolean).join(' ')
  const ariaLabel = typeof label === 'string' ? label : undefined
  return (
    <Element className={classes} aria-label={ariaLabel} {...rest}>
      {label ? <h2 className="tpage-panel-label">{label}</h2> : null}
      {children}
    </Element>
  )
}

export default ThemedPage
