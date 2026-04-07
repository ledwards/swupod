// src/components/DraftReportButton.tsx
// @ts-nocheck
import Button from './Button'
import './DraftReportButton.css'

interface DraftReportButtonProps {
  draftShareId: string
  variant?: 'default' | 'pool' | 'play'
}

export default function DraftReportButton({ draftShareId, variant = 'default' }: DraftReportButtonProps) {
  const icon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <path d="M12 18l-2-1.5L8 18v-4h8v4l-2-1.5L12 18z" fill="rgba(255,215,0,0.4)" stroke="rgba(255,215,0,0.9)" strokeWidth="1.5"></path>
    </svg>
  )

  if (variant === 'play') {
    return (
      <button
        className="draft-report-button-play"
        onClick={() => { window.location.href = `/draft/${draftShareId}/report` }}
      >
        {icon}
        Draft Report
      </button>
    )
  }

  return (
    <Button
      variant="secondary"
      className={`draft-report-button${variant === 'pool' ? ' pool-variant' : ''}`}
      onClick={() => { window.location.href = `/draft/${draftShareId}/report` }}
    >
      {icon}
      <span>Draft Report</span>
    </Button>
  )
}
