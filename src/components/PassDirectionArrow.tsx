// @ts-nocheck
'use client'

import './PassDirectionArrow.css'

export interface PassDirectionArrowProps {
  direction: 'left' | 'right'
}

function PassDirectionArrow({ direction }: PassDirectionArrowProps) {
  return (
    <div className={`pass-direction-arrow ${direction}`}>
      <div className="arrow-circle">
        <span className="arrow-symbol">
          {direction === 'left' ? '←' : '→'}
        </span>
      </div>
      <div className="arrow-label">
        Passing {direction}
      </div>
    </div>
  )
}

export default PassDirectionArrow
