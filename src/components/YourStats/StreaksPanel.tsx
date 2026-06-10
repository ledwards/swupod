// @ts-nocheck
/**
 * StreaksPanel — list of statistically interesting per-card pull counts.
 *
 * Per plan U7 / R11:
 *   - Empty list → "no notable streaks in this range"
 *   - Populated → list of card items with cardName, observed × expected, copy.
 *   - Zero-pull cards labelled "Never pulled" instead of "Pulled 0×".
 *   - streaksHasMore → bottom expander stub. v1: emits a TODO no-op (per
 *     plan task spec). Wired to a button so layout/keyboard focus are correct.
 */
'use client'

import { useState } from 'react'
import Button from '@/src/components/Button'

export interface StreakItem {
  cardId: string
  cardName: string
  observed: number
  expected: number
  pValue: number
  copy: string
}

export interface StreaksPanelProps {
  streaks: StreakItem[]
  streaksHasMore: boolean
}

function formatObservedExpected(observed: number, expected: number): string {
  if (observed === 0) {
    return `Never pulled · expected ~${expected.toFixed(1)}`
  }
  const times = observed === 1 ? 'time' : 'times'
  return `Pulled ${observed.toLocaleString()} ${times} · expected ~${expected.toFixed(1)}`
}

function StreakRow({ item }: { item: StreakItem }) {
  return (
    <li className="your-stats-streak-row" data-testid="streak-row">
      <div className="your-stats-streak-row-main">
        <div className="your-stats-streak-card-name" data-testid="streak-card-name">
          {item.cardName || item.cardId}
        </div>
        <div
          className="your-stats-streak-counts"
          data-testid={item.observed === 0 ? 'streak-never-pulled' : 'streak-pulled'}
        >
          {formatObservedExpected(item.observed, item.expected)}
        </div>
      </div>
      {item.copy && (
        <p className="your-stats-streak-copy" data-testid="streak-copy">
          {item.copy}
        </p>
      )}
    </li>
  )
}

export function StreaksPanel({ streaks, streaksHasMore }: StreaksPanelProps) {
  const [showAllRequested, setShowAllRequested] = useState(false)

  if (!streaks || streaks.length === 0) {
    return (
      <section
        className="your-stats-streaks"
        data-testid="streaks-panel"
        aria-label="Card streaks"
      >
        <header className="your-stats-luck-panel-header">
          <h4 className="your-stats-luck-panel-title">Notable cards</h4>
        </header>
        <p
          className="your-stats-streaks-empty"
          data-testid="streaks-empty"
        >
          No notable streaks in this range.
        </p>
      </section>
    )
  }

  return (
    <section
      className="your-stats-streaks"
      data-testid="streaks-panel"
      aria-label="Card streaks"
    >
      <header className="your-stats-luck-panel-header">
        <h4 className="your-stats-luck-panel-title">Notable cards</h4>
      </header>
      <ul className="your-stats-streaks-list" data-testid="streaks-list">
        {streaks.map((item) => (
          <StreakRow key={item.cardId} item={item} />
        ))}
      </ul>
      {streaksHasMore && (
        <div className="your-stats-streaks-more">
          {/* v1: this is a stub — clicking it just acknowledges. A future
              iteration will re-fetch /api/stats/me/luck without the cap.
              The button exists so keyboard focus, screen reader, and
              layout all match the final shape. */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              // TODO(U7): re-fetch /api/stats/me/luck without the streaks cap.
              setShowAllRequested(true)
            }}
            disabled={showAllRequested}
            data-testid="streaks-show-all-stub"
            aria-label="Show all notable cards (coming soon)"
          >
            {showAllRequested ? 'Coming soon' : 'And more — show all'}
          </Button>
        </div>
      )}
    </section>
  )
}

export default StreaksPanel
