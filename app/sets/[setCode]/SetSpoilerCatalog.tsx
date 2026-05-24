// @ts-nocheck
'use client'

import { useMemo, useState } from 'react'
import { AspectIcon } from '@/src/components/AspectIcon'

const RARITIES = ['All', 'Common', 'Uncommon', 'Rare', 'Legendary', 'Special']
const GROUPS = [
  { value: 'all', label: 'All' },
  { value: 'leader', label: 'Leaders' },
  { value: 'base', label: 'Bases' },
  { value: 'main', label: 'Main deck' },
]
const STATUSES = [
  { value: 'all', label: 'All' },
  { value: 'spoiled', label: 'Spoiled' },
  { value: 'placeholder', label: 'Unknown' },
]

function formatNumber(value: number): string {
  return Number(value || 0).toLocaleString()
}

function percent(realCount: number, targetCount: number): number {
  if (!targetCount) return 100
  return Math.max(0, Math.min(100, Math.round((realCount / targetCount) * 100)))
}

function AspectPills({ aspects, compact = false }: { aspects: string[], compact?: boolean }) {
  if (!aspects || aspects.length === 0) {
    return <span className="set-catalog-aspect-pill set-catalog-aspect-pill--neutral">Neutral</span>
  }

  return (
    <span className={`set-catalog-aspect-pills ${compact ? 'set-catalog-aspect-pills--compact' : ''}`}>
      {aspects.map(aspect => (
        <span className="set-catalog-aspect-pill" key={aspect}>
          <AspectIcon aspect={aspect} size={compact ? 'xs' : 'sm'} />
          {!compact && <span>{aspect}</span>}
        </span>
      ))}
    </span>
  )
}

function ProgressBar({ realCount, targetCount }: { realCount: number, targetCount: number }) {
  return (
    <div className="set-catalog-progress" aria-hidden="true">
      <span style={{ width: `${percent(realCount, targetCount)}%` }} />
    </div>
  )
}

function InventoryRow({ row }: { row: Record<string, any> }) {
  const remaining = row.placeholderCount

  return (
    <div className="set-catalog-inventory-row">
      <div>
        <span className="set-catalog-row-label">{row.label}</span>
        <span className="set-catalog-row-subline">
          {formatNumber(row.realCount)} known / {formatNumber(row.targetCount)} expected
        </span>
      </div>
      <div className="set-catalog-row-meter">
        <ProgressBar realCount={row.realCount} targetCount={row.targetCount} />
        <span>{formatNumber(remaining)} unknown</span>
      </div>
    </div>
  )
}

function AspectInventoryTile({ row }: { row: Record<string, any> }) {
  const aspects = row.key === 'Neutral' ? [] : String(row.key).split('+')

  return (
    <article className="set-catalog-aspect-tile">
      <div className="set-catalog-aspect-tile-header">
        <AspectPills aspects={aspects} compact />
        <strong>{formatNumber(row.placeholderCount)}</strong>
      </div>
      <div className="set-catalog-aspect-tile-label">{row.label}</div>
      <ProgressBar realCount={row.realCount} targetCount={row.targetCount} />
      <div className="set-catalog-aspect-tile-meta">
        {formatNumber(row.realCount)} / {formatNumber(row.targetCount)} known
      </div>
    </article>
  )
}

function TreatmentButton({ summary, active, onClick }: { summary: Record<string, any>, active: boolean, onClick: () => void }) {
  return (
    <button
      type="button"
      className={`set-catalog-treatment ${active ? 'set-catalog-treatment--active' : ''}`}
      onClick={onClick}
    >
      <span>{summary.variantType}</span>
      <strong>{formatNumber(summary.realCount)} / {formatNumber(summary.targetCount)}</strong>
    </button>
  )
}

function CardTile({ card }: { card: Record<string, any> }) {
  const title = card.isPlaceholder
    ? card.placeholderBucketLabel || card.name
    : card.name
  const cardNumber = card.cardId || (card.number ? `${card.set}-${card.number}` : null)

  return (
    <article className={`set-catalog-card ${card.isPlaceholder ? 'set-catalog-card--placeholder' : ''}`}>
      <div className={`set-catalog-card-media ${['leader', 'base'].includes(card.group) ? 'set-catalog-card-media--landscape' : ''}`}>
        {card.imageUrl ? (
          <img src={card.imageUrl} alt={card.name} loading="lazy" />
        ) : (
          <div className="set-catalog-placeholder-art">
            <span>Unknown</span>
            <strong>{card.rarity}</strong>
          </div>
        )}
      </div>
      <div className="set-catalog-card-body">
        <div className="set-catalog-card-kicker">
          <span>{cardNumber || `${card.variantType} slot`}</span>
          <span>{card.isPlaceholder ? 'Unknown' : 'Spoiled'}</span>
        </div>
        <h3>{title}</h3>
        <div className="set-catalog-card-meta">
          <span>{card.rarity}</span>
          <span>{card.type !== 'Unknown' ? card.type : card.groupLabel}</span>
          <span>{card.variantType}</span>
        </div>
        <AspectPills aspects={card.aspects || []} compact={card.aspects?.length > 2} />
        {card.isPlaceholder && (
          <p className="set-catalog-slot-note">
            Slot {card.placeholderSlotIndex} of {card.placeholderTargetCount}
          </p>
        )}
      </div>
    </article>
  )
}

export default function SetSpoilerCatalog({ overview }: { overview: Record<string, any> }) {
  const [variant, setVariant] = useState(overview.variants.includes('Normal') ? 'Normal' : overview.variants[0])
  const [status, setStatus] = useState('all')
  const [rarity, setRarity] = useState('All')
  const [group, setGroup] = useState('all')
  const [search, setSearch] = useState('')

  const variantSummary = overview.variantSummaries.find(summary => summary.variantType === variant) ||
    overview.variantSummaries[0] || { targetCount: 0, realCount: 0, placeholderCount: 0 }
  const rollups = overview.rollupsByVariant[variant] || { byRarity: [], byAspect: [], byGroup: [] }

  const filteredBuckets = useMemo(() => {
    return overview.buckets.filter(bucket =>
      bucket.variantType === variant &&
      (rarity === 'All' || bucket.rarity === rarity) &&
      (group === 'all' || bucket.group === group)
    )
  }, [overview.buckets, variant, rarity, group])

  const filteredCards = useMemo(() => {
    const query = search.trim().toLowerCase()

    return overview.cards.filter(card => {
      if (card.variantType !== variant) return false
      if (rarity !== 'All' && card.rarity !== rarity) return false
      if (group !== 'all' && card.group !== group) return false
      if (status === 'spoiled' && card.isPlaceholder) return false
      if (status === 'placeholder' && !card.isPlaceholder) return false

      if (!query) return true
      return [
        card.name,
        card.cardId,
        card.number,
        card.placeholderBucketLabel,
        card.rarity,
        card.type,
        card.aspectKey,
      ].filter(Boolean).some(value => String(value).toLowerCase().includes(query))
    })
  }, [overview.cards, variant, rarity, group, status, search])

  return (
    <main className="set-catalog-page">
      <header className="set-catalog-hero">
        <div className="set-catalog-nav">
          <a href="/sets">Sets</a>
        </div>
        <div className="set-catalog-hero-copy">
          <p className="set-catalog-kicker">{overview.setCode} Spoiler Catalog</p>
          <h1>{overview.setName}</h1>
          <div className="set-catalog-hero-meta">
            {overview.metadata.placeholderVersion && <span>{overview.metadata.placeholderVersion}</span>}
            {overview.metadata.lastProcessed && <span>Processed {overview.metadata.lastProcessed}</span>}
            {overview.metadata.placeholderStatus && <span>Status: {overview.metadata.placeholderStatus}</span>}
          </div>
        </div>
        <div className="set-catalog-stats">
          <div>
            <span>Normal Spoiled</span>
            <strong>{formatNumber(overview.totals.normalRealCount)} / {formatNumber(overview.totals.normalTargetCount)}</strong>
          </div>
          <div>
            <span>Normal Unknown</span>
            <strong>{formatNumber(overview.totals.normalPlaceholderCount)}</strong>
          </div>
          <div>
            <span>Pack Placeholders</span>
            <strong>{formatNumber(overview.totals.placeholderCount)}</strong>
          </div>
          <div>
            <span>All Catalog Cards</span>
            <strong>{formatNumber(overview.totals.cardCount)}</strong>
          </div>
        </div>
        <ProgressBar realCount={overview.totals.normalRealCount} targetCount={overview.totals.normalTargetCount} />
      </header>

      {overview.metadata.contradictions?.length > 0 && (
        <section className="set-catalog-alert" aria-label="Catalog validation">
          <strong>Bucket conflict</strong>
          <span>{overview.metadata.contradictions.length} bucket assumption needs review after the latest sync.</span>
        </section>
      )}

      <section className="set-catalog-section">
        <div className="set-catalog-section-heading">
          <div>
            <p className="set-catalog-kicker">Treatments</p>
            <h2>Pack-Ready Inventory</h2>
          </div>
        </div>
        <div className="set-catalog-treatments" role="tablist" aria-label="Card treatment">
          {overview.variantSummaries.map(summary => (
            <TreatmentButton
              key={summary.variantType}
              summary={summary}
              active={summary.variantType === variant}
              onClick={() => setVariant(summary.variantType)}
            />
          ))}
        </div>
      </section>

      <section className="set-catalog-section set-catalog-inventory">
        <div className="set-catalog-section-heading">
          <div>
            <p className="set-catalog-kicker">{variant}</p>
            <h2>Remaining Shape</h2>
          </div>
          <div className="set-catalog-section-count">
            {formatNumber(variantSummary.placeholderCount)} unknown
          </div>
        </div>

        <div className="set-catalog-inventory-grid">
          <div className="set-catalog-panel">
            <h3>Rarity</h3>
            <div className="set-catalog-inventory-list">
              {rollups.byRarity.map(row => <InventoryRow key={row.key} row={row} />)}
            </div>
          </div>
          <div className="set-catalog-panel">
            <h3>Aspect Buckets</h3>
            <div className="set-catalog-aspect-grid">
              {rollups.byAspect.map(row => <AspectInventoryTile key={row.key} row={row} />)}
            </div>
          </div>
        </div>
      </section>

      <section className="set-catalog-section">
        <div className="set-catalog-section-heading">
          <div>
            <p className="set-catalog-kicker">{variant}</p>
            <h2>Bucket Ledger</h2>
          </div>
          <div className="set-catalog-section-count">{formatNumber(filteredBuckets.length)} buckets</div>
        </div>

        <div className="set-catalog-controls">
          <select value={rarity} onChange={event => setRarity(event.target.value)} aria-label="Rarity">
            {RARITIES.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
          <select value={group} onChange={event => setGroup(event.target.value)} aria-label="Card group">
            {GROUPS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>

        <div className="set-catalog-table-wrap">
          <table className="set-catalog-table">
            <thead>
              <tr>
                <th>Bucket</th>
                <th>Group</th>
                <th>Rarity</th>
                <th>Aspects</th>
                <th>Known</th>
                <th>Unknown</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredBuckets.map(bucket => (
                <tr key={bucket.bucketId}>
                  <td>{bucket.label}</td>
                  <td>{bucket.groupLabel}</td>
                  <td>{bucket.rarity}</td>
                  <td><AspectPills aspects={bucket.aspects} compact /></td>
                  <td>{formatNumber(bucket.realCount)}</td>
                  <td>{formatNumber(bucket.placeholderCount)}</td>
                  <td>{formatNumber(bucket.targetCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="set-catalog-section">
        <div className="set-catalog-section-heading">
          <div>
            <p className="set-catalog-kicker">{variant}</p>
            <h2>Cards And Slots</h2>
          </div>
          <div className="set-catalog-section-count">{formatNumber(filteredCards.length)} shown</div>
        </div>

        <div className="set-catalog-controls set-catalog-controls--wide">
          <input
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search cards and buckets"
            aria-label="Search cards and buckets"
          />
          <div className="set-catalog-segmented" role="group" aria-label="Spoiler status">
            {STATUSES.map(option => (
              <button
                key={option.value}
                type="button"
                className={status === option.value ? 'set-catalog-segmented-active' : ''}
                onClick={() => setStatus(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="set-catalog-card-grid">
          {filteredCards.map(card => <CardTile key={card.id} card={card} />)}
        </div>
      </section>
    </main>
  )
}
