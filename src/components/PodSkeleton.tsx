/** Shared pod-page structure while the pod's name, players and pairings load. */
export default function PodSkeleton({
  format,
}: {
  format: 'Draft' | 'Sealed'
}) {
  return (
    <div
      className="pod-page"
      aria-busy="true"
      aria-label={`Loading ${format} pod`}
    >
      <div className="pod-content">
        <button className="pod-back-button" disabled>
          Edit Deck
        </button>
        <div className="pod-header">
          <div
            className="skeleton-line"
            style={{ width: '60%', height: 38, margin: '0 auto 8px' }}
          />
          <p className="pod-pool-type">{format} Pod</p>
        </div>
        {format === 'Sealed' && (
          <div className="practice-hand-button-container">
            <button className="pod-action-button" disabled>
              Practice Hand
            </button>
          </div>
        )}
        <div className="pod-status-section">
          <h2>Pod Status</h2>
          <div className="pod-player-grid">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="pod-player-row" aria-hidden="true">
                <span className="pod-seat-number">{i + 1}</span>
                <span className="pod-match-avatar skeleton-block" />
                <span
                  className="skeleton-line"
                  style={{ width: '55%', height: 18 }}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="pod-opponent-card">
          <h2>Your Opponent</h2>
          <div className="pod-opponent-info" aria-hidden="true">
            <div className="pod-opponent-avatar skeleton-block" />
            <div className="pod-opponent-details">
              <div
                className="skeleton-line"
                style={{ width: 140, height: 22 }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
