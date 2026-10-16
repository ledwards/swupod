'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import Button from '../Button'
import EditableTitle from '../EditableTitle'
import ContentSkeleton from '../ContentSkeleton'
import CardWithPreview from '../CardWithPreview'
import { RarityLabel } from '../CardIcons'
import { SiteTitle } from '../SiteTheme'
import SiteFooter from '../SiteFooter'
import { LogIcon, ShareIcon } from '../PodHub/icons'
import type { CardData } from '../Card'
import PoolBuildCards from './PoolBuildCards'
import { updatePool } from '../../utils/poolApi'
import { getCanonicalPoolSubtitle } from '../../utils/deckBuilderSharing'
import type { PoolCard } from '../../services/pools/poolPage'
import './pool-page.css'

export interface PoolViewProps {
  shareId: string | null
  setCode: string
  poolType: 'sealed' | 'draft'
  poolName: string | null
  createdAt?: string | null
  ownerId?: string | null
  ownerUsername?: string | null
  draftShareId?: string | null
  /** Packs to show, already split (Leaders / Round N / Pack N); null while loading. */
  packs: Array<{ name: string; cards: PoolCard[] }> | null
  /** The root pool whose builds list here (a child build lists its parent's). */
  buildsShareId?: string | null
}

const isWide = (c: PoolCard) => Boolean(c.isLeader) || c.type === 'Leader' || Boolean(c['isBase']) || c.type === 'Base'

/**
 * A pool (alpha): its title (renamable by the owner of a sealed pool), its
 * decks with aspect icons, Copy Link / Draft Log / Build Deck, then every pack
 * as a titled panel of cards with their rarity.
 */
export default function PoolView({ shareId, setCode, poolType, poolName: initialName, createdAt, ownerId, ownerUsername, draftShareId, packs, buildsShareId }: PoolViewProps) {
  const { user } = useAuth() as { user: { id?: string } | null }
  const [poolName, setPoolName] = useState(initialName)
  const [copied, setCopied] = useState(false)
  useEffect(() => setPoolName(initialName), [initialName])
  const isOwner = Boolean(user?.id && ownerId && user.id === ownerId)

  const rename = async (name: string | null) => {
    if (!shareId || !name) return
    try { await updatePool(shareId, { name }); setPoolName(name) } catch (err) { console.error('Failed to rename pool:', err) }
  }
  const copyLink = async () => {
    if (!shareId) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/pool/${shareId}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard blocked: leave it */ }
  }

  return (
    <div className="ppg-page">
      <SiteTitle subtitle={getCanonicalPoolSubtitle({ ownerName: ownerUsername ?? null, setCode, poolType, createdAt: createdAt ?? null })}>
        <EditableTitle value={poolName} onSave={name => void rename(name)} isEditable={isOwner && poolType !== 'draft'}
          placeholder={poolType === 'draft' ? 'Draft Pool' : 'Sealed Pool'}/>
      </SiteTitle>
      <main className="ppg-content">
        <section className="ppg-panel ppg-top" aria-label="Pool actions and decks">
          {buildsShareId ? <PoolBuildCards shareId={buildsShareId} currentUserId={user?.id ?? null}/> : <span className="ppg-builds"/>}
          <div className="ppg-actions">
            {shareId && (
              <Button onClick={() => void copyLink()} aria-label={copied ? 'Copied!' : 'Copy Link'}>
                <ShareIcon/>{copied ? 'Copied!' : 'Copy Link'}
              </Button>
            )}
            {draftShareId && (
              <a className="btn btn--secondary btn--md" href={`/draft/${encodeURIComponent(draftShareId)}/log`} target="_blank" rel="noopener noreferrer">
                <LogIcon/>Draft Log
              </a>
            )}
            {packs && packs.length > 0 && shareId && (
              <a className="btn btn--primary btn--lg" href={`/pools/${encodeURIComponent(shareId)}/deck`}>Build Deck</a>
            )}
          </div>
        </section>

        {packs === null
          ? <section className="ppg-panel" aria-busy="true" aria-label="Packs"><ContentSkeleton kind="card" count={14}/></section>
          : <div className="ppg-packs">
            {packs.map((pack, i) => (
              <section key={`${pack.name}-${i}`} className="ppg-panel ppg-panel--labeled" aria-label={pack.name}>
                <h2 className="ppg-panel-label">{pack.name}</h2>
                <div className="ppg-cards">
                  {pack.cards.map((card, j) => (
                    <div key={`${card.id ?? card.name}-${j}`} className={`ppg-card${isWide(card) ? ' is-wide' : ''}`}>
                      <CardWithPreview card={card as CardData}/>
                      <RarityLabel rarity={card['rarity'] as string | undefined}/>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>}
      </main>
      <SiteFooter/>
    </div>
  )
}
