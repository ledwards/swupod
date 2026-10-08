export default function ListingSkeleton() {
  return (
    <div className="lobby-row" aria-hidden="true">
      <div className="lobby-row-avatar skeleton-block" />
      <div className="lobby-row-who">
        <div
          className="skeleton-line"
          style={{ width: '70%', height: 18, marginBottom: 8 }}
        />
        <div className="skeleton-line" style={{ width: '45%', height: 14 }} />
      </div>
      <div
        className="skeleton-block"
        style={{ width: 76, height: 34, flexShrink: 0 }}
      />
    </div>
  )
}
