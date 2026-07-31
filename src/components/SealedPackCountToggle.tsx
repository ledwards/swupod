/**
 * Sealed pack-count choice — the single site-wide implementation of the
 * "6 Packs / 8 Packs" option. Used by the solo sealed set-selection page
 * (`app/sealed/page.tsx`) and the sealed pod creation page
 * (`app/sealed/new/page.tsx`).
 *
 * Segmented control = shared Button (`variant="toggle"` + `glowColor="blue"`),
 * per the style guide — never hand-rolled CSS. Options come from
 * `SEALED_PACK_COUNT_OPTIONS` so 6/8 stays the one source of truth.
 */
import Button from './Button'
import { SEALED_PACK_COUNT_OPTIONS } from '../utils/sealedPodConfig'

export interface SealedPackCountToggleProps {
  /** Currently selected pack count. */
  value: number
  /** Called with the newly picked pack count. */
  onChange: (packCount: number) => void
  /** Locks the choice (e.g. Competitive Sealed is always 8 packs). */
  disabled?: boolean
  /** Tooltip for the whole group — used to explain a locked choice. */
  title?: string
}

export default function SealedPackCountToggle({
  value,
  onChange,
  disabled = false,
  title,
}: SealedPackCountToggleProps) {
  return (
    <div
      className="sealed-pack-count-toggle"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
      title={title}
      role="group"
      aria-label="Packs per player"
    >
      {SEALED_PACK_COUNT_OPTIONS.map((packCount) => (
        <Button
          key={packCount}
          variant="toggle"
          glowColor="blue"
          size="sm"
          active={value === packCount}
          disabled={disabled}
          aria-pressed={value === packCount}
          data-testid={`sealed-pack-count-${packCount}`}
          onClick={() => onChange(packCount)}
        >
          {packCount} Packs
        </Button>
      ))}
    </div>
  )
}
