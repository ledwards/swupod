// @ts-nocheck
'use client'

/**
 * PatreonFeaturesBox — gold "Special Features" expander that enumerates every
 * Friends-of-the-Pod feature. Collapsed by default; clicking the header
 * animates the list open/closed.
 *
 * Content comes from the single source of truth in src/utils/patreonFeatures.ts
 * (see .claude/rules/patreon-features.md). Do not hard-code perks here.
 */

import { useState } from 'react'
import { PATREON_FEATURES } from '../utils/patreonFeatures'
import './PatreonFeaturesBox.css'

export interface PatreonFeaturesBoxProps {
  /** Start expanded. Defaults to collapsed. */
  defaultOpen?: boolean
  className?: string
}

export default function PatreonFeaturesBox({ defaultOpen = false, className = '' }: PatreonFeaturesBoxProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`patreon-features-box${open ? ' open' : ''}${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="patreon-features-toggle"
        aria-expanded={open}
        aria-controls="patreon-features-content"
        onClick={() => setOpen(o => !o)}
      >
        <span className="patreon-features-toggle-label">
          <span className="patreon-features-star" aria-hidden="true">★</span>
          Special Features
        </span>
        <span className="patreon-features-chevron" aria-hidden="true">▾</span>
      </button>
      <div
        id="patreon-features-content"
        className="patreon-features-collapse"
        role="region"
        aria-label="Friend of the Pod features"
      >
        <ul className="patreon-features-list">
          {PATREON_FEATURES.map(f => (
            <li key={f.id} className="patreon-features-item">
              <strong>{f.title}</strong> — {f.description}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
