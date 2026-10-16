import { AspectIcon } from '@/src/components/AspectIcon'
import SetPagePromoBanner from '@/src/components/SetPagePromoBanner'
import { compareCatalogCards, groupCatalogCards, type CatalogCard } from '@/src/services/cards/setCatalog'
import SetCatalogCard from './SetCatalogCard'
import './set-catalog-alpha.css'

const n = (value: number) => value.toLocaleString()

/**
 * The themed set page (alpha): spoiler progress, then the cards grouped
 * Leaders, Bases and each aspect, in the catalog order. Server-rendered so
 * every card name is in the HTML.
 */
export default function SetCatalog({ setCode, setName, cards }: { setCode: string; setName: string; cards: CatalogCard[] }) {
  const groups = groupCatalogCards([...cards].sort(compareCatalogCards))
  const spoiled = cards.filter(c => !c.isPlaceholder).length
  const total = cards.length
  const known = (key: string) => {
    const group = groups.find(g => g.key === key)
    return group ? { known: group.cards.filter(c => !c.isPlaceholder).length, total: group.cards.length } : null
  }
  const leaders = known('leaders')
  const bases = known('bases')
  const pct = total ? Math.min(100, Math.round((spoiled / total) * 100)) : 0

  return (
    <div className="setc-page">
      <h1>{setName}</h1>
      <p>Every card spoiled so far, with slots for the rest</p>

      <SetPagePromoBanner setCode={setCode} />

      <div className="setc-panel setc-progress">
        <div className="setc-progress-main">
          <p className="setc-count"><strong>{n(spoiled)} / {n(total)}</strong> cards spoiled</p>
          <div className="setc-bar" role="img" aria-label={`${n(spoiled)} of ${n(total)} cards spoiled`}>
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="setc-chips">
          {leaders && <span className="setc-chip">Leaders {leaders.known} / {leaders.total}</span>}
          {bases && <span className="setc-chip">Bases {bases.known} / {bases.total}</span>}
          {total > spoiled && <span className="setc-chip">Unknown {n(total - spoiled)}</span>}
        </div>
      </div>

      {groups.map(group => (
        <section key={group.key} className="setc-group" aria-labelledby={`setc-${group.key}`}>
          <h2 id={`setc-${group.key}`} className="setc-group-head">
            {group.aspect && <span aria-hidden="true" className="setc-group-icon"><AspectIcon aspect={group.aspect} size="lg" /></span>}
            {group.label} ({group.cards.length})
          </h2>
          <div className="setc-grid">
            {group.cards.map(card => <SetCatalogCard key={card.id} card={card} />)}
          </div>
        </section>
      ))}
    </div>
  )
}
