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
}

export function findPageTitle(root: ParentNode): PageTitle | null {
  for (const h1 of Array.from(root.querySelectorAll<HTMLElement>('h1'))) {
    if (h1.dataset.siteTitle === 'skip') continue
    if (h1.closest('[data-site-title="skip"], .ph-shell')) continue
    if (h1.classList.contains('lobby-visually-hidden')) continue
    if (h1.querySelector('button, input, a, [contenteditable], select, textarea')) continue
    const text = (h1.dataset.siteTitleText ?? h1.textContent ?? '').trim()
    if (!text) continue
    return {element: h1, text, keep: h1.dataset.siteTitle === 'keep'}
  }
  return null
}

const sections: Record<string, string> = {
  draft: 'Draft', sealed: 'Sealed', formats: 'Formats', history: 'History', stats: 'Stats',
  pool: 'Pools', pools: 'Pools', sets: 'Sets', play: 'Play', import: 'Import', showcases: 'Showcases',
  admin: 'Admin', lobby: 'Lobby', redeem: 'Redeem', gift: 'Gift', connections: 'Connections',
}

/** Parent section offered as the header back link. Only child routes get one, and never one that repeats the title. */
export function backLinkFor(pathname: string | null, title: string): {label: string; href: string} | null {
  const parts = (pathname ?? '/').split('/').filter(Boolean)
  if (parts.length < 2) return null
  const section = parts[0] ?? ''
  const label = sections[section]
  if (!label || label.toLowerCase() === title.trim().toLowerCase()) return null
  return {label, href: `/${section}`}
}
