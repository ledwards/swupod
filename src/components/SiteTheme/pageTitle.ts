/**
 * The site header shows every route's title. Pages keep rendering one h1; the
 * header mirrors it and hides it in place, so headings stay in reading order
 * for assistive tech without each page owning header layout.
 *
 * Per-h1 overrides:
 *   data-site-title="keep"      the h1 stays visible in the page (profile heroes)
 *   data-site-title="skip"      the header ignores this h1 entirely
 *   data-site-title-text="…"    the header shows this text instead of the h1's
 */
export interface PageTitle {
  element: HTMLElement
  text: string
  keep: boolean
  subtitle: {element: HTMLElement; text: string} | null
}

/**
 * A short line right under the page heading rides along into the header.
 * Long descriptions, anything with icons or controls, and anything marked
 * data-site-subtitle="keep" stay in the page.
 */
export const SUBTITLE_MAX_LENGTH = 72
export function findPageSubtitle(h1: HTMLElement): {element: HTMLElement; text: string} | null {
  const next = h1.nextElementSibling as HTMLElement | null
  if (!next || next.tagName !== 'P') return null
  if (next.dataset.siteSubtitle === 'keep' || next.getAttribute('role') === 'alert') return null
  if (next.querySelector('img, svg, a, button, input, select, textarea')) return null
  const text = (next.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (!text || text.length > SUBTITLE_MAX_LENGTH) return null
  return {element: next, text}
}

export function findPageTitle(root: ParentNode): PageTitle | null {
  for (const h1 of Array.from(root.querySelectorAll<HTMLElement>('h1'))) {
    if (h1.dataset.siteTitle === 'skip') continue
    if (h1.closest('[data-site-title="skip"], .ph-shell')) continue
    if (h1.classList.contains('lobby-visually-hidden')) continue
    if (h1.querySelector('button, input, a, [contenteditable], select, textarea')) continue
    const text = (h1.dataset.siteTitleText ?? h1.textContent ?? '').trim()
    if (!text) continue
    return {element: h1, text, keep: h1.dataset.siteTitle === 'keep', subtitle: h1.dataset.siteTitle === 'keep' ? null : findPageSubtitle(h1)}
  }
  return null
}

const sections: Record<string, string> = {
  draft: 'Draft', sealed: 'Sealed', formats: 'Formats', history: 'History', stats: 'Stats',
  pool: 'Pools', pools: 'Pools', sets: 'Sets', play: 'Play', import: 'Import', showcases: 'Showcases',
  admin: 'Admin', lobby: 'Lobby', redeem: 'Redeem', gift: 'Gift', connections: 'Connections',
}

/** The header's back link names where it goes: the parent section for child routes, Home for section landing pages. Never one that repeats the title. */
export function backLinkFor(pathname: string | null, title: string): {label: string; href: string} | null {
  const parts = (pathname ?? '/').split('/').filter(Boolean)
  if (pathname === null || parts.length === 0 || (parts.length === 1 && parts[0] === 'lobby')) return null
  if (parts.length < 2) return {label: 'Home', href: '/'}
  const section = parts[0] ?? ''
  const label = sections[section]
  if (!label || label.toLowerCase() === title.trim().toLowerCase()) return null
  return {label, href: `/${section}`}
}
