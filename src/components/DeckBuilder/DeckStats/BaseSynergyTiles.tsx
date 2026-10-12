/**
 * Base synergy: one tile per base trait the set's cards check for (HMW's four
 * planets). Each tile lists the cards that turn on with a base of that trait —
 * deck cards solid, sideboard cards faded — and that trait's bases.
 */

import { AspectIcon } from '../../AspectIcon'
import type { SynergyCard, SynergyTile } from '../../../services/deckStats'
import { SET_CONFIGS } from '../../../utils/setConfigs'
import { StatsPanel } from './StatsCharts'

function CardLine({ card, faded }: { card: SynergyCard; faded?: boolean }) {
  return (
    <li className={`deck-stats-synergy-card${faded ? ' is-sideboard' : ''}`}>
      {card.aspects[0] ? <AspectIcon aspect={card.aspects[0]} size="sm" /> : <span className="deck-stats-icon-spacer" />}
      <span>{card.count > 1 && `${card.count}× `}{card.name}</span>
    </li>
  )
}

export function BaseSynergyTiles({ tiles, setCode, currentBaseName }: { tiles: SynergyTile[]; setCode: string; currentBaseName?: string | null | undefined }) {
  return (
    <StatsPanel label="Base Synergy" badge={setCode} badgeColor={SET_CONFIGS[setCode]?.color}>
      <div className="deck-stats-synergy">
        {tiles.map(tile => (
          <div key={tile.trait} className={`deck-stats-synergy-tile${tile.isCurrent ? ' is-current' : ''}`}>
            <div className="deck-stats-synergy-head">
              <b>{tile.trait}</b>
              <span className="deck-stats-count"><b>{tile.deckCount}</b> / {tile.poolCount}</span>
            </div>
            {tile.isCurrent && currentBaseName && <span className="deck-stats-synergy-yours">Your Base · {currentBaseName}</span>}
            {tile.poolCount === 0 ? (
              <p className="deck-stats-synergy-empty">No cards in your pool</p>
            ) : (
              <ul className="deck-stats-synergy-list">
                {tile.deck.map(card => <CardLine key={`d-${card.name}`} card={card} />)}
                {tile.sideboard.map(card => <CardLine key={`s-${card.name}`} card={card} faded />)}
              </ul>
            )}
            <div className="deck-stats-synergy-bases">
              {tile.bases.map(base => (
                <span key={base.name} className={base.name === currentBaseName ? 'is-current' : ''}>
                  {base.aspects[0] && <AspectIcon aspect={base.aspects[0]} size="xs" />}{base.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="deck-stats-legend">
        <span>In deck</span>
        <span className="deck-stats-legend-faded">Sideboard</span>
        <span>Count: deck / pool</span>
      </div>
    </StatsPanel>
  )
}
