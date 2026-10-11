// What a pod does once the draft ends. Create a Pod and the host's Tournament sheet share these.
const ICON = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

export const AFTER_DRAFT_CHOICES = [
  { value: 'none' as const, label: 'None', icon: <svg {...ICON}><circle cx="12" cy="12" r="7.5" /><path d="M5.5 18.5 18.5 5.5" /></svg> },
  { value: 'swiss' as const, label: 'Swiss', icon: <svg {...ICON}><rect x="4" y="4" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" /></svg> },
  { value: 'elimination' as const, label: 'Bracket', icon: <svg {...ICON}><path d="M4 5h5v12H4M9 11h11" /></svg> },
]
