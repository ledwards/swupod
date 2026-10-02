/** Matches the histogram, summary widgets and aspect panel in LuckSection. */
export default function LuckSkeleton() {
  return (
    <>
      <div className="your-stats-luck-panel" aria-hidden="true">
        <div
          className="skeleton-line"
          style={{ width: '45%', height: 22, marginBottom: 20 }}
        />
        <div className="skeleton-line" style={{ width: '100%', height: 180 }} />
      </div>
      <div className="your-stats-luck-widget-row" aria-hidden="true">
        {[0, 1].map((i) => (
          <div className="your-stats-luck-panel" key={i}>
            <div
              className="skeleton-line"
              style={{ width: '65%', height: 18 }}
            />
            <div
              className="skeleton-line"
              style={{ width: '45%', height: 36, marginTop: 16 }}
            />
          </div>
        ))}
      </div>
      <div className="your-stats-luck-panel" aria-hidden="true">
        <div
          className="skeleton-line"
          style={{ width: '40%', height: 22, marginBottom: 20 }}
        />
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="skeleton-line"
            style={{ width: '100%', height: 20, marginTop: 12 }}
          />
        ))}
      </div>
    </>
  )
}
