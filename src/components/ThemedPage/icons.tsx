/**
 * Glyphs the themed small pages need that the site already draws but does not
 * export from a shared module. Each is copied verbatim from its origin (noted
 * per icon) rather than redrawn, so a Copy or Discard control looks the same
 * here as everywhere else. Icons that ARE exported elsewhere (DownloadIcon,
 * LockIcon, CheckIcon, LogIcon) are imported from their origin instead.
 */

/** Copy-to-clipboard: DraftLobby's copy-link button. */
export const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
)

/** Trash can for destructive actions: CreatorClipRow / PoolBuilds. */
export const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    <line x1="10" y1="11" x2="10" y2="17"></line>
    <line x1="14" y1="11" x2="14" y2="17"></line>
  </svg>
)

/** Play triangle: CreatorClipRow's Example button. */
export const PlayIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
)

/** Stop square: ClipRecorder / CreatorClipRow. */
export const StopIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
)
