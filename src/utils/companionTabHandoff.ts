/**
 * Safari tab handoff for the Companion launches that must claim first.
 *
 * The one-click launches on `/g/{shareId}` (casual open games) and the Swiss
 * Practice match cards can't know their destination until a server claim comes
 * back — create a lobby, join this URL, or wait. So the click handler awaits a
 * fetch and only then posts the Companion intent.
 *
 * On Safari that await is fatal. Safari discards the page's transient user
 * activation across it, so the Companion's launcher — which on Safari must open
 * the tab from the page's own context, because its MV3 service worker's
 * chrome.tabs.create silently no-ops — gets its window.open refused and the
 * button does nothing. (Reported 2026-08-12; the same activation trap that hit
 * the Create Private Lobby button on 2026-07-28.)
 *
 * The fix is to open the tab HERE, synchronously inside the click while the
 * activation is still live, and tell the Companion the tab already exists
 * (`tabOpenedByPage: true`) so it only stashes the intent for that tab to claim
 * on load. We then navigate the tab ourselves once the claim resolves.
 *
 * Chrome and Firefox are untouched: their Companion opens the tab from the
 * background, keyed to that tab's id, and has no popup gate to lose. We gate on
 * `data-platform="safari"` from the Companion's own presence marker rather than
 * sniffing the user agent — the extension is the authority on which build it
 * is, and builds too old to stamp the attribute are also too old to honor the
 * flag, so they correctly keep opening the tab themselves.
 */

/** Karabast's front door — where a create-a-lobby launch lands. */
export const KARABAST_HOME_URL = 'https://karabast.net/'

/** The Companion build serving this page, per its detection marker. */
export function companionPlatform(): string | null {
  if (typeof document === 'undefined') return null
  const meta = document.querySelector('meta[name="wayfinder-installed"]') as HTMLMetaElement | null
  return meta?.dataset.platform ?? null
}

export interface CompanionTabHandoff {
  /** Send the pre-opened tab to its destination, now that the claim resolved. */
  navigate: (url: string) => void
  /** Nothing to launch after all — don't strand a blank tab. */
  close: () => void
}

/**
 * Open the destination tab up front, or return null to let the Companion open
 * it. MUST be called synchronously in the click handler, before any await.
 */
export function openCompanionHandoffTab(): CompanionTabHandoff | null {
  if (companionPlatform() !== 'safari') return null
  const tab = typeof window === 'undefined' ? null : window.open('about:blank', '_blank')
  if (!tab) return null
  return {
    navigate: (url: string) => {
      try {
        tab.location.href = url
      } catch {
        /* the user closed it mid-claim — nothing to steer */
      }
    },
    close: () => {
      try {
        tab.close()
      } catch {
        /* already gone */
      }
    },
  }
}

export default openCompanionHandoffTab
