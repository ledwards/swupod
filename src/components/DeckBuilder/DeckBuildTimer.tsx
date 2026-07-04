import CountdownTimer from '../CountdownTimer'

const BUILD_WINDOW_SECONDS = 20 * 60

interface DeckBuildTimerProps {
  deadline: string
  variant?: 'header' | 'nav'
}

export function DeckBuildTimer({ deadline, variant = 'header' }: DeckBuildTimerProps) {
  const deadlineTime = new Date(deadline).getTime()
  const startedAt = new Date(deadlineTime - BUILD_WINDOW_SECONDS * 1000).toISOString()

  return (
    <div className={`deck-build-timer deck-build-timer--${variant}`}>
      <span className="deck-build-timer-label">Build Timer</span>
      <CountdownTimer
        totalSeconds={BUILD_WINDOW_SECONDS}
        startedAt={startedAt}
        active={true}
        label=""
        warningThreshold={300}
      />
    </div>
  )
}

export default DeckBuildTimer
