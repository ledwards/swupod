// @ts-nocheck
'use client'

import './CompetitivePracticeRules.css'

interface CompetitivePracticeRulesProps {
  showTitle?: boolean
  swissOnly?: boolean
  /** 'draft' (default) shows pick timers; 'sealed' shows the Competitive Sealed rules. */
  format?: 'draft' | 'sealed'
}

export function CompetitivePracticeRules({ showTitle = true, swissOnly = false, format = 'draft' }: CompetitivePracticeRulesProps = {}) {
  if (format === 'sealed' && !swissOnly) {
    return (
      <div className="cpm-rules cpm-rules--sealed">
        {showTitle && <h3 className="cpm-rules-title">Competitive Sealed</h3>}
        <p className="cpm-rules-intro">
          Practice like it's a real event. A bigger pool, a timed deck build, and a
          Swiss-style match schedule mirror competitive sealed rules.
        </p>

        <div className="cpm-rules-section">
          <h4>Sealed Pool</h4>
          <ul>
            <li>Each player opens 8 booster packs instead of the standard 6.</li>
            <li>Up to 8 players per pod.</li>
            <li>Everyone opens packs at the same time and builds from their own pool.</li>
          </ul>
        </div>

        <div className="cpm-rules-section">
          <h4>Deck Build</h4>
          <ul>
            <li>5 minutes to open your packs and look over your pool.</li>
            <li>Then a full 20 minutes to build — the build timer doesn&apos;t start until the pack-opening time is up.</li>
            <li>Warnings at 5:00 (yellow) and 1:00 (red).</li>
            <li>At 0:00 your deck auto-locks as-is and you&apos;re sent to the play page.</li>
          </ul>
        </div>

        <div className="cpm-rules-section">
          <h4>Matches</h4>
          <ul>
            <li>Swiss Practice begins after deck building — three best-of-three rounds paired by record.</li>
            <li>Wayfinder can record results automatically; manual mutual confirmation remains available.</li>
          </ul>
        </div>
      </div>
    )
  }

  if (swissOnly) {
    return (
      <div className="cpm-rules cpm-rules--swiss-only">
        {showTitle && <h3 className="cpm-rules-title">Swiss Practice</h3>}
        <div className="cpm-rules-section">
          <h4>How it works</h4>
          <ul>
            <li>Three Swiss rounds after deck building.</li>
            <li>Best-of-three matches each round.</li>
            <li>Pairings are based on record, with no rematches.</li>
            <li>Odd player counts create a bye, which counts as a win.</li>
            <li>Standings rank by record, then OMW% tiebreaker.</li>
          </ul>
        </div>
      </div>
    )
  }

  return (
    <div className="cpm-rules">
      {showTitle && <h3 className="cpm-rules-title">Competitive Practice Mode</h3>}
      <p className="cpm-rules-intro">
        Practice like it's a real event. Pick timers, chat restrictions, and a Swiss-style
        post-draft match schedule mirror Appendix C competitive rules.
      </p>

      <div className="cpm-rules-section">
        <h4>Draft</h4>
        <ul>
          <li>Exactly 8 players; seats are shuffled at start.</li>
          <li>Chat is disabled while the draft is running.</li>
          <li>Drafted cards are hidden during picks — you only see a counter.</li>
          <li>30-second review period between packs to look over what you've taken.</li>
        </ul>
      </div>

      <div className="cpm-rules-section">
        <h4>Leader Draft Timers</h4>
        <table className="cpm-rules-table">
          <thead>
            <tr><th>Leaders remaining</th><th>Time</th></tr>
          </thead>
          <tbody>
            <tr><td>3</td><td>15s</td></tr>
            <tr><td>2</td><td>10s</td></tr>
            <tr><td>1</td><td>Auto-pick</td></tr>
          </tbody>
        </table>
      </div>

      <div className="cpm-rules-section">
        <h4>Pack Draft Timers</h4>
        <table className="cpm-rules-table">
          <thead>
            <tr><th>Cards remaining</th><th>Time</th></tr>
          </thead>
          <tbody>
            <tr><td>14</td><td>60s</td></tr>
            <tr><td>13–12</td><td>40s</td></tr>
            <tr><td>11–10</td><td>30s</td></tr>
            <tr><td>9–8</td><td>25s</td></tr>
            <tr><td>7</td><td>20s</td></tr>
            <tr><td>6</td><td>15s</td></tr>
            <tr><td>5–4</td><td>10s</td></tr>
            <tr><td>3–2</td><td>5s</td></tr>
            <tr><td>1</td><td>Auto-pick</td></tr>
          </tbody>
        </table>
        <p className="cpm-rules-note">
          When a timer expires, a bot strategy auto-picks for you and you'll see which card was taken.
        </p>
      </div>

      <div className="cpm-rules-section">
        <h4>Deck Build</h4>
        <ul>
          <li>20 minutes to build your deck once the draft completes.</li>
          <li>Warnings at 5:00 (yellow) and 1:00 (red).</li>
          <li>At 0:00 your deck auto-locks as-is and you're sent to the play page.</li>
        </ul>
      </div>

      <div className="cpm-rules-section">
        <h4>Matches</h4>
        <ul>
          <li>Swiss Practice begins after the draft — three best-of-three rounds paired by record.</li>
          <li>Wayfinder can record results automatically; manual mutual confirmation remains available.</li>
        </ul>
      </div>
    </div>
  )
}

export default CompetitivePracticeRules
