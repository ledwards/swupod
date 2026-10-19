'use client'
import {createContext, useContext, type ComponentPropsWithoutRef, type ReactNode} from 'react'
import {createPortal} from 'react-dom'

/** The site header's title slot; SiteTheme provides it once the header has mounted. */
export const SiteTitleSlotContext = createContext<HTMLElement | null>(null)

/**
 * A page's h1 rendered inside the site header. Static headings are mirrored
 * automatically (see pageTitle.ts); headings that carry controls, such as an
 * editable pool or draft name, render through this so the control itself
 * lives in the header. Without the site theme it is a plain h1 in place.
 *
 * Until the header's slot exists (server HTML and the first client render) this
 * h1 sits in the page, where the mirror could copy it into the header. Once the
 * slot appears it moves there too, and on a slow machine the header showed the
 * title twice. It is marked "skip" so the mirror never takes it. Only the mirror
 * reads that mark, and the mirror runs only with the site theme on.
 */
export function SiteTitle({subtitle, subtitleClassName, ...props}: ComponentPropsWithoutRef<'h1'> & {subtitle?: ReactNode; subtitleClassName?: string}) {
  const slot = useContext(SiteTitleSlotContext)
  const heading = <><h1 data-site-title="skip" {...props}/>{subtitle ? <p className={slot ? 'site-subtitle' : subtitleClassName}>{subtitle}</p> : null}</>
  return slot ? createPortal(heading, slot) : heading
}
