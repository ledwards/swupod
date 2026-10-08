// @ts-nocheck
'use client'

import './TimerButton.css'

const PauseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="6" y="4" width="4" height="16"></rect>
    <rect x="14" y="4" width="4" height="16"></rect>
  </svg>
)

const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
)

export interface TimerButtonProps {
  isPaused: boolean
  onClick?: () => void
  disabled?: boolean
}

/**
 * Timer Button Component
 *
 * A specialized button for pause/play timer controls.
 * Shows pause icon when timer is running, play icon when paused.
 * Has distinct styling for paused state (amber/yellow).
 *
 * Props:
 *   - isPaused: boolean - whether the timer is currently paused
 *   - onClick: function - called when button is clicked
 *   - disabled: boolean - optional, disables the button
 */
export function TimerButton({ isPaused, onClick, disabled = false }: TimerButtonProps) {
  return (
    <button
      className={`timer-button ${isPaused ? 'resume' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {isPaused ? <PlayIcon /> : <PauseIcon />}
    </button>
  )
}

export default TimerButton
