/** Card name with its cost and aspect icons, and a grade chip: shared by the Meta tab and the drawer's Meta preview. */

import CostIcon from '../../CostIcon'
import { AspectIcon } from '../../AspectIcon'
import type { MetaRow } from '../../../services/deckStats'

export const gradeTone = (grade?: string | null) => `meta-grade--${grade?.[0]?.toLowerCase() ?? 'none'}`

export function MetaCardCell({ row }: { row: MetaRow }) {
  return (
    <span className="meta-card-cell">
      <CostIcon cost={row.card.cost ?? 0} size={20} />
      {row.card.aspects?.[0] ? <AspectIcon aspect={row.card.aspects[0]} size="sm" /> : <span className="meta-icon-spacer" />}
      <span>{row.copies > 1 && <span className="meta-dim">{row.copies}× </span>}{row.card.name}</span>
    </span>
  )
}

export function GradeChip({ grade }: { grade?: string | null | undefined }) {
  return <span className={`meta-grade ${gradeTone(grade)}`}>{grade ?? '—'}</span>
}
