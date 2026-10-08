// @ts-nocheck
// Reusable cost icon component
export interface CostIconProps {
  cost: number | string | null | undefined
  size?: number
}

function CostIcon({ cost, size = 32 }: CostIconProps) {
  if (cost === null || cost === undefined) return null

  // Handle string costs like "8+" - use smaller font for multi-char
  const displayCost = String(cost)
  const isMultiChar = displayCost.length > 1
  const fontSize = isMultiChar
    ? Math.round(size * 0.5)  // Smaller for "8+"
    : Math.round(size * 0.625) // Normal for single digits

  return (
    <div style={{
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: `${size}px`,
      height: `${size}px`
    }}>
      <img
        src="/icons/cost.png"
        alt="Cost"
        style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
      />
      <span style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        color: 'white',
        fontWeight: 'bold',
        fontSize: `${fontSize}px`,
        textShadow: '1px 1px 2px rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1
      }}>
        {displayCost}
      </span>
    </div>
  )
}

export default CostIcon
