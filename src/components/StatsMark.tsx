// Bar-chart glyph — the one "Stats" affordance used site-wide (deck builder
// header, /me pool history, /history rows, landing-page history rows).
export default function StatsMark({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <rect x="7" y="11" width="3" height="5" rx="1" />
      <rect x="12" y="8" width="3" height="8" rx="1" />
      <rect x="17" y="6" width="3" height="10" rx="1" />
    </svg>
  )
}
