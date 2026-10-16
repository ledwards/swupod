import { QA_STATUS_LABEL, type QAStatus } from '@/src/services/qaReport'

const ICON_PATHS: Record<QAStatus, string[]> = {
  pass: ['m5 12 5 5 9-10'],
  watch: ['M12 4 2.5 20h19Z', 'M12 10v4', 'M12 17v.5'],
  fail: ['M6 6l12 12', 'M18 6 6 18'],
  none: ['M6 12h12'],
}

/**
 * The QA verdict pill: always an icon plus a word, never colour alone. The
 * themed QA counterpart of the luck panel's RegimeBadge, with QA's four states.
 */
export function QAStatusBadge({ status, label }: { status: QAStatus; label?: string }) {
  return (
    <span className={`qar-badge qar-badge--${status}`} data-status={status}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {ICON_PATHS[status].map((d) => <path key={d} d={d} />)}
      </svg>
      {label ?? QA_STATUS_LABEL[status]}
    </span>
  )
}
